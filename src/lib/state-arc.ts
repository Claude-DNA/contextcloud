/**
 * state-arc.ts
 * A character's arc of states, scene by scene, kept on the character's cloud item as metadata.state_arc.
 * Graph building writes it; a writer can pin a state to a scene (from an audition), and later builds keep it.
 */
import { ATOMIC_STATE_MAP, deriveFormulaColor, formatFormula, type StateFormula } from '@/lib/state-formula';

export interface ArcEntry {
  beat: string;
  beat_number?: number;
  state: string;
  delta: string;
  formula?: string;
  base?: string[];
  missing?: string[];
  modifier?: string;
  intensity?: number;
  color?: string;
  /** Set by the writer (an audition); graph building uses it instead of proposing its own. */
  pinned?: boolean;
  /** A short take from the audition that settled this state: how the character sounds in it. */
  audition?: string;
}

const ids = (v: unknown, n: number) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).toLowerCase()))].filter((id) => ATOMIC_STATE_MAP[id]).slice(0, n) : []);

/** The parts of a formula an arc entry keeps, from { base, missing, modifier, intensity }. Null when nothing is felt. */
export function arcFormula(x: unknown): Pick<ArcEntry, 'formula' | 'base' | 'missing' | 'modifier' | 'intensity' | 'color'> | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const base = ids(o.base, 3);
  const missing = ids(o.missing, 2).filter((id) => !base.includes(id));
  if (!base.length) return null;
  const modifier = typeof o.modifier === 'string' && ATOMIC_STATE_MAP[o.modifier] && !base.includes(o.modifier) ? o.modifier : undefined;
  const intensity = [1, 2, 3].includes(Number(o.intensity)) ? Number(o.intensity) : 2;
  const f = toFormula({ base, missing, modifier, intensity });
  return { formula: formatFormula(f), base, missing, ...(modifier ? { modifier } : {}), intensity, color: deriveFormulaColor(f) };
}

/** An arc entry's formula as a node formula. */
export function toFormula(e: { base?: string[]; missing?: string[]; modifier?: string; intensity?: number; color?: string }, name = ''): StateFormula {
  const base = e.base ?? [];
  const missing = e.missing ?? [];
  const f: StateFormula = {
    id: `arc-${base.join('-')}${missing.length ? `-no-${missing.join('-')}` : ''}${e.modifier ? `-x-${e.modifier}` : ''}`,
    name,
    base: [...base, ...missing],
    ...(missing.length ? { signs: Object.fromEntries([...base.map((id) => [id, 1]), ...missing.map((id) => [id, -1])]) as Record<string, 1 | -1> } : {}),
    ...(e.modifier ? { modifier: e.modifier } : {}),
    intensity: (e.intensity === 1 || e.intensity === 3 ? e.intensity : 2) as 1 | 2 | 3,
  };
  if (!f.name) f.name = formatFormula(f);
  f.color = e.color || deriveFormulaColor(f);
  return f;
}

/** A node formula as the { base, missing, modifier, intensity } an arc entry keeps. */
export function fromFormula(f: StateFormula) {
  return {
    base: f.base.filter((id) => (f.signs?.[id] ?? 1) === 1),
    missing: f.base.filter((id) => f.signs?.[id] === -1),
    ...(f.modifier && f.modifierSign !== -1 ? { modifier: f.modifier } : {}),
    intensity: f.intensity ?? 2,
  };
}

/** Puts an entry in the arc: it replaces the entry for the same beat, otherwise it goes in beat order. */
export function upsertArc(arc: ArcEntry[], entry: ArcEntry): ArcEntry[] {
  const same = (e: ArcEntry) => e.beat.trim().toLowerCase() === entry.beat.trim().toLowerCase();
  const out = arc.some(same) ? arc.map((e) => (same(e) ? entry : e)) : [...arc, entry];
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.beat_number ?? Number.MAX_SAFE_INTEGER) - (b.e.beat_number ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .map((x) => x.e)
    .slice(0, 60);
}
