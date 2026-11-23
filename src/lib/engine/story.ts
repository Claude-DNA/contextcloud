/**
 * Character State Engine — reading a story out of Studio's cloud items.
 * Characters keep their identity and agendas in metadata.engine; arc scenes keep the readings the
 * author approved in metadata.engine.approved. Nothing here writes; nothing else in the metadata is touched.
 */
import { DEFAULT_SETTINGS, WORLD, type Beat, type Deed, type Effect, type EventKind, type Settings, type Story, type StoryEvent } from './types';
import { readInstance } from './identity';
import { clamp, clamp1 } from './math';

export interface EngineItem {
  id: string;
  cloud_type: string;
  title: string;
  content?: string;
  metadata: Record<string, unknown> | null;
}

const EVENT_KINDS: EventKind[] = ['happening', 'wrong', 'kindness', 'loss', 'apology', 'betrayal', 'reminder', 'threat', 'lie', 'contact'];
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const n01 = (v: unknown, f: number) => { const x = Number(v); return Number.isFinite(x) ? clamp(x) : f; };

/** An effect from either { id: value } or [{ target, value }]; only known ids (and the world) are kept. */
export function readEffect(raw: unknown, known: Set<string>): Effect {
  const out: Effect = {};
  const put = (k: unknown, v: unknown) => {
    const id = str(k, 80);
    const x = Number(v);
    if ((known.has(id) || id === WORLD) && Number.isFinite(x) && Math.abs(x) >= 0.01) out[id] = clamp1(x);
  };
  if (Array.isArray(raw)) for (const e of raw) put((e as { target?: unknown })?.target, (e as { value?: unknown })?.value);
  else if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) put(k, v);
  return out;
}

const ids = (v: unknown, known: Set<string>) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, 80)).filter((x) => known.has(x)))] : []);

export function readEvent(raw: unknown, known: Set<string>, i: number): StoryEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = EVENT_KINDS.includes(o.kind as EventKind) ? (o.kind as EventKind) : 'happening';
  const by = known.has(str(o.by, 80)) ? str(o.by, 80) : undefined;
  const target = known.has(str(o.target, 80)) ? str(o.target, 80) : undefined;
  const effect = readEffect(o.effect, known);
  const label = str(o.label);
  if (!label && !Object.keys(effect).length) return null;
  return { id: str(o.id, 60) || `e${i + 1}`, label, kind, ...(by ? { by } : {}), ...(target ? { target } : {}), effect, size: n01(o.size, 0.5), ...(ids(o.witnesses, known).length ? { witnesses: ids(o.witnesses, known) } : {}) };
}

export function readDeed(raw: unknown, known: Set<string>, i: number): Deed | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const actor = str(o.actor, 80);
  if (!known.has(actor)) return null;
  const kinds = ['act', 'apology', 'confession', 'amends'] as const;
  const branches = ['heroic', 'despair', 'rage'] as const;
  const forcedBy = known.has(str(o.forcedBy, 80)) && str(o.forcedBy, 80) !== actor ? str(o.forcedBy, 80) : undefined;
  return {
    id: str(o.id, 60) || `d${i + 1}`,
    actor,
    label: str(o.label) || 'acts',
    effect: readEffect(o.effect, known),
    visibility: n01(o.visibility, 0.7),
    ...(ids(o.witnesses, known).length ? { witnesses: ids(o.witnesses, known) } : {}),
    kind: kinds.includes(o.kind as (typeof kinds)[number]) ? (o.kind as Deed['kind']) : 'act',
    ...(o.odds !== undefined ? { odds: n01(o.odds, 0.6) } : {}),
    ...(o.risk !== undefined ? { risk: n01(o.risk, 0.15) } : {}),
    ...(o.effort !== undefined ? { effort: n01(o.effort, 0.1) } : {}),
    plotWeight: n01(o.plotWeight, 0.5),
    choice: o.choice === true,
    ...(forcedBy ? { forcedBy, pressure: n01(o.pressure, 0.5) } : {}),
    ...(branches.includes(o.branch as (typeof branches)[number]) ? { branch: o.branch as Deed['branch'] } : {}),
  };
}

/** The approved reading of a scene (or nothing yet). */
export function readBeat(item: EngineItem, known: Set<string>): Beat {
  const m = (item.metadata ?? {}) as Record<string, unknown>;
  const engine = (m.engine && typeof m.engine === 'object' ? m.engine : {}) as Record<string, unknown>;
  const approved = (engine.approved && typeof engine.approved === 'object' ? engine.approved : {}) as Record<string, unknown>;
  const events = (Array.isArray(approved.events) ? approved.events : []).map((e, i) => readEvent(e, known, i)).filter((e): e is StoryEvent => !!e);
  const deeds = (Array.isArray(approved.deeds) ? approved.deeds : []).map((d, i) => readDeed(d, known, i)).filter((d): d is Deed => !!d);
  return { id: item.id, title: item.title, present: ids(approved.present, known), events, deeds, flash: m.when === 'flashback' || m.when === 'flash_forward' };
}

export function readSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mw: Record<string, number> = {};
  if (o.moralWeights && typeof o.moralWeights === 'object') for (const [k, v] of Object.entries(o.moralWeights as Record<string, unknown>)) { const x = Number(v); if (Number.isFinite(x)) mw[str(k, 80)] = Math.min(3, Math.max(0, x)); }
  const seed = Math.trunc(Number(o.seed));
  return {
    seed: Number.isFinite(seed) ? seed : DEFAULT_SETTINGS.seed,
    alpha: n01(o.alpha, DEFAULT_SETTINGS.alpha),
    lambda: n01(o.lambda, DEFAULT_SETTINGS.lambda),
    moralWeights: mw,
    storyTemperature: n01(o.storyTemperature, DEFAULT_SETTINGS.storyTemperature),
    drafting: o.drafting === true,
    flagBudget: Math.min(10, Math.max(1, Math.trunc(Number(o.flagBudget)) || DEFAULT_SETTINGS.flagBudget)),
  };
}

/** Characters + arc scenes (in order) → a story the engine can run. */
export function buildStory(items: EngineItem[], settings: unknown): Story {
  const chars = items.filter((i) => i.cloud_type === 'characters');
  const known = new Set(chars.map((c) => c.id));
  const characters: Story['characters'] = {};
  const names: Story['names'] = { [WORLD]: 'the world' };
  for (const c of chars) {
    const engine = (c.metadata as Record<string, unknown> | null)?.engine;
    const inst = readInstance(engine, c.title);
    inst.identity.name = inst.identity.name === 'Unnamed character' ? c.title : inst.identity.name;
    // Agenda effects may only name characters in this story.
    for (const a of [...inst.real, ...(inst.declared ? [inst.declared] : [])]) a.effect = readEffect(a.effect, known);
    characters[c.id] = inst;
    names[c.id] = c.title;
  }
  const beats = items.filter((i) => i.cloud_type === 'arc').map((s) => readBeat(s, known));
  return { characters, names, beats, settings: readSettings(settings) };
}
