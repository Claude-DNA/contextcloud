/**
 * Character State Engine — the portable character file (.character.json): reading it safely,
 * defaults, and the two type settings (temperature, persistence).
 */
import { CHARACTER_SCHEMA, type Agenda, type Identity, type Instance, type ReferenceWeight } from './types';
import { clamp, clamp1 } from './math';
import { CARRIED, FEELING } from './feelings';
import { blendReferences } from './references';

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, fallback: number, lo = 0, hi = 1) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'character';
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function feelingMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (FEELING[k]) out[k] = num(x, 0);
  return out;
}

function cast(v: unknown): ReferenceWeight[] {
  return arr(v)
    .map((m) => ({ reference: str((m as ReferenceWeight)?.reference, 120), weight: num((m as ReferenceWeight)?.weight, 0, 0, 100) }))
    .filter((m) => m.reference && m.weight > 0)
    .slice(0, 3);
}

export function newIdentity(name = 'New character'): Identity {
  return {
    schema: CHARACTER_SCHEMA,
    id: slug(name),
    name,
    summary: '',
    drives: [],
    fears: [],
    values: [],
    contradictions: [],
    temperament: { baseline: { calm: 0.3 }, sensitivity: {} },
    conscience: 0.6,
    selfImage: 0.4,
    selfControl: 0.5,
    persistence: { overall: 0.5 },
    temperature: {},
    history: [],
  };
}

/** Reads anything that claims to be a character file. Unknown fields are dropped; values are clamped. */
export function readIdentity(raw: unknown): Identity {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = str(o.name, 120) || 'Unnamed character';
  const persistence: Identity['persistence'] = { overall: 0.5 };
  if (o.persistence && typeof o.persistence === 'object') {
    for (const [k, v] of Object.entries(o.persistence as Record<string, unknown>)) {
      if (k === 'overall') persistence.overall = num(v, 0.5);
      else if (CARRIED.includes(k)) persistence[k] = num(v, 0.5);
    }
  } else if (typeof o.persistence === 'number') persistence.overall = num(o.persistence, 0.5);
  const t = (o.temperature && typeof o.temperature === 'object' ? o.temperature : {}) as Record<string, unknown>;
  const temperament = (o.temperament && typeof o.temperament === 'object' ? o.temperament : {}) as Record<string, unknown>;
  return {
    schema: CHARACTER_SCHEMA,
    id: str(o.id, 80) || slug(name),
    name,
    summary: str(o.summary, 600),
    drives: arr(o.drives).map((d) => ({ drive: str((d as { drive?: unknown })?.drive, 60), weight: num((d as { weight?: unknown })?.weight, 0.3) })).filter((d) => d.drive).slice(0, 8),
    fears: arr(o.fears).map((d) => ({ fear: str((d as { fear?: unknown })?.fear, 60), weight: num((d as { weight?: unknown })?.weight, 0.3) })).filter((d) => d.fear).slice(0, 6),
    values: arr(o.values).map((v) => str(v, 60)).filter(Boolean).slice(0, 8),
    contradictions: arr(o.contradictions)
      .map((c) => {
        const between = arr((c as { between?: unknown })?.between).map((x) => str(x, 60));
        return { between: [between[0] ?? '', between[1] ?? ''] as [string, string], note: str((c as { note?: unknown })?.note, 300) || undefined };
      })
      .filter((c) => c.between[0] && c.between[1])
      .slice(0, 6),
    temperament: { baseline: feelingMap(temperament.baseline), sensitivity: feelingMap(temperament.sensitivity) },
    conscience: num(o.conscience, 0.6),
    selfImage: num(o.selfImage, 0.4, -1, 1),
    selfControl: num(o.selfControl, 0.5),
    persistence,
    temperature: { ...(t.value !== undefined ? { value: num(t.value, 0.35) } : {}), ...(cast(t.cast).length ? { cast: cast(t.cast) } : {}) },
    history: arr(o.history)
      .map((h) => {
        const x = h as Record<string, unknown>;
        return { wound: str(x.wound, 300), feeling: CARRIED.includes(str(x.feeling)) ? str(x.feeling) : 'resentment', significance: num(x.significance, 0.5), ...(str(x.targetRole, 60) ? { targetRole: str(x.targetRole, 60) } : {}) };
      })
      .filter((h) => h.wound)
      .slice(0, 8),
  };
}

/** 0 predictable … 1 unpredictable: the identity's own value, else its cast, else the story's default. */
export function temperatureOf(identity: Identity, storyDefault: number): number {
  if (typeof identity.temperature.value === 'number') return clamp(identity.temperature.value);
  return clamp(blendReferences(identity.temperature.cast, 'temperature') ?? storyDefault);
}

/** 0 easy-going … 1 stubborn, for one carried feeling. */
export function persistenceOf(identity: Identity, feeling: string): number {
  const own = identity.persistence[feeling];
  if (typeof own === 'number' && feeling !== 'overall') return clamp(own);
  return clamp(identity.persistence.overall ?? 0.5);
}

/** Reads an agenda saved on a character; effect values are clamped. */
export function readAgenda(raw: unknown, fallbackId: string): Agenda | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const effect: Record<string, number> = {};
  if (o.effect && typeof o.effect === 'object') for (const [k, v] of Object.entries(o.effect as Record<string, unknown>)) { const n = Number(v); if (Number.isFinite(n) && n !== 0) effect[k] = clamp1(n); }
  const label = str(o.label, 200);
  if (!label && !Object.keys(effect).length) return null;
  return { id: str(o.id, 60) || fallbackId, label, effect, weight: num(o.weight, 0.5) };
}

/** Reads the engine data saved on a character item into an instance. */
export function readInstance(raw: unknown, fallbackName: string): Instance {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const identity = o.identity ? readIdentity(o.identity) : newIdentity(fallbackName);
  const real = arr(o.real).map((a, i) => readAgenda(a, `r${i + 1}`)).filter((a): a is Agenda => !!a).slice(0, 5);
  const total = real.reduce((s, a) => s + a.weight, 0);
  for (const a of real) a.weight = total > 0 ? a.weight / total : 1 / real.length;
  const roles: Record<string, string> = {};
  if (o.roles && typeof o.roles === 'object') for (const [k, v] of Object.entries(o.roles as Record<string, unknown>)) if (str(v)) roles[str(k, 60)] = str(v, 80);
  return { identity, declared: readAgenda(o.declared, 'declared'), real, roles };
}
