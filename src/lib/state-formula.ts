/**
 * state-formula.ts
 * The character state vocabulary: atomic states, formulas built from them, and what a formula means
 * in words. Used by the graph editor (to build and show formulas) and by the server (to put a
 * formula into prompts and to read the formulas the AI proposes).
 *
 * A formula reads  (Base + Base − Base) × Modifier, at an intensity:
 *   Base + Base   feelings present together, pulling at the same time
 *   − Base        a feeling the situation calls for that is missing or held down
 *   × Modifier    the channel: how the base feelings come out in what the character does
 *   intensity     1 an undertone · 2 plain to see · 3 it runs the character
 */

export interface AtomicState {
  id: string;
  label: string;
  axis: 'love' | 'fear' | 'neutral' | 'burden' | 'active' | 'saddle';
  color: string;
  description: string;
}

export const ATOMIC_STATES: AtomicState[] = [
  // Love axis
  { id: 'love',      label: 'Love',      axis: 'love',    color: '#E91E8C', description: 'Attachment pull; focus on what you have' },
  { id: 'hope',      label: 'Hope',      axis: 'love',    color: '#4CAF50', description: 'Love that outruns the evidence; belief in a good outcome' },
  { id: 'joy',       label: 'Joy',       axis: 'love',    color: '#FFD600', description: 'Present-tense positive state' },
  { id: 'wonder',    label: 'Wonder',    axis: 'love',    color: '#29B6F6', description: 'Passive openness to the unknown' },
  { id: 'curiosity', label: 'Curiosity', axis: 'active',  color: '#26C6DA', description: 'Active pursuit of the unknown (not Wonder)' },
  // Fear axis
  { id: 'fear',      label: 'Fear',      axis: 'fear',    color: '#1565C0', description: 'Exposure to unknown × self-preservation; default state' },
  { id: 'despair',   label: 'Despair',   axis: 'fear',    color: '#263238', description: 'Fear that outruns the evidence; certainty of a bad outcome' },
  { id: 'rage',      label: 'Rage',      axis: 'active',  color: '#B71C1C', description: 'Reactive force; present-tense' },
  { id: 'ambition',  label: 'Ambition',  axis: 'active',  color: '#C49000', description: 'Active pursuit of gain: money, rank, advantage; focus on what you could get' },
  { id: 'disgust',   label: 'Disgust',   axis: 'fear',    color: '#558B2F', description: 'Boundary enforcement, rejection' },
  { id: 'distrust',  label: 'Distrust',  axis: 'fear',    color: '#37474F', description: 'Not believing in others\' intentions' },
  { id: 'confusion', label: 'Confusion', axis: 'neutral', color: '#757575', description: 'Epistemic zero-vector; Soul-Mind disconnection' },
  { id: 'calm',      label: 'Calm',      axis: 'neutral', color: '#90A4AE', description: 'Settled; nothing pulling. The baseline the other states disturb' },
  // Burdens (carry trapped Love)
  { id: 'guilt',     label: 'Guilt',     axis: 'burden',  color: '#6A1B9A', description: 'I DID wrong; Love trapped in violation awareness' },
  { id: 'shame',     label: 'Shame',     axis: 'burden',  color: '#4A148C', description: 'I AM wrong; self-collapse' },
  { id: 'grief',     label: 'Grief',     axis: 'burden',  color: '#37474F', description: 'Love trapped in loss; backward-facing' },
  // Masks / Modifiers
  { id: 'pride',     label: 'Pride',     axis: 'fear',    color: '#F57F17', description: 'Fear\'s most successful mask; self-expansion' },
  // Saddle point
  { id: 'envy',      label: 'Envy',      axis: 'saddle',  color: '#2E7D32', description: 'Inherently unstable; always resolves (→ Admiration or Resentment)' },
  // Longing
  { id: 'longing',   label: 'Longing',   axis: 'burden',  color: '#7B1FA2', description: 'Desire for something absent; bridge between Love and Grief' },
];

export interface StateFormula {
  id: string;
  name: string;
  base: string[];                     // atomic state ids
  signs?: Record<string, 1 | -1>;    // +1 (default) or -1 (negated); e.g. { love: -1 } means −Love
  modifier?: string;                  // atomic state id, or the id of a preset formula (Compassion, Cynicism)
  modifierSign?: 1 | -1;              // modifier can also be negated
  description?: string;
  isPreset?: boolean;
  color?: string;       // display color (auto-derived if empty)
  intensity?: 1 | 2 | 3; // 1 undertone, 2 plain to see (default), 3 it runs the character
}

export const PRESET_FORMULAS: StateFormula[] = [
  // Field equations
  {
    id: 'evil-formula',
    name: 'Evil Formula',
    base: ['love', 'confusion'],
    modifier: 'pride',
    description: 'Love loses direction via Confusion; Pride (Fear\'s mask) fills the vacuum. Person inside feels love, not evil.',
    isPreset: true,
    color: '#B71C1C',
  },
  {
    id: 'honor',
    name: 'Honor',
    base: ['fear', 'curiosity'],
    modifier: 'compassion',
    description: 'Fear keeps the stakes real and Curiosity sees clearly; both come out as Compassion, so strength is used for someone.',
    isPreset: true,
    color: '#F57F17',
  },
  {
    id: 'compassion',
    name: 'Compassion',
    base: ['love', 'curiosity'],
    description: 'Always active. Moves toward. Sees the other clearly through Love.',
    isPreset: true,
    color: '#E91E8C',
  },
  {
    id: 'cynicism',
    name: 'Cynicism',
    base: ['fear', 'wonder'],
    description: 'Passive by default. Sees clearly — through Fear. When activated: aggression, lies, betrayal.',
    isPreset: true,
    color: '#1565C0',
  },
  {
    id: 'admiration',
    name: 'Admiration',
    base: ['envy', 'wonder'],
    modifier: 'curiosity',
    description: 'Proactive. Curiosity converts Envy + Wonder into movement toward. The stable resolution of Envy.',
    isPreset: true,
    color: '#26C6DA',
  },
  {
    id: 'contempt',
    name: 'Contempt',
    base: ['pride', 'disgust'],
    modifier: 'cynicism',
    description: 'Passive. Looks down, withdraws, dismisses. Cynicism as modifier: cold, analytical rejection.',
    isPreset: true,
    color: '#558B2F',
  },
  {
    id: 'resentment',
    name: 'Resentment',
    base: ['pride', 'confusion'],
    modifier: 'rage',
    description: 'Feeling you should be more than your situation + not knowing why. Variable modifier.',
    isPreset: true,
    color: '#B71C1C',
  },
  {
    id: 'warrior-honor',
    name: 'Warrior Honor',
    base: ['fear', 'curiosity'],
    modifier: 'love',
    description: 'Fear keeps stakes real. Curiosity sees opponent as someone to understand. Love as modifier: you fight but the enemy has a face.',
    isPreset: true,
    color: '#F57F17',
  },
  {
    id: 'sociopathy',
    name: 'Sociopathy',
    base: ['fear', 'distrust'],
    description: 'Clear, operational, cold. Has concluded: everyone is a potential threat.',
    isPreset: true,
    color: '#263238',
  },
  {
    id: 'paranoia',
    name: 'Paranoia',
    base: ['fear', 'distrust', 'confusion'],
    description: 'Same base as Sociopathy but no stable target. Confusion makes the threat spiral and shift.',
    isPreset: true,
    color: '#1A237E',
  },
  {
    id: 'remorse',
    name: 'Remorse',
    base: ['guilt', 'curiosity'],
    description: 'Catalyst that releases Love from Guilt. Active turn toward what was broken. Not guilt about guilt.',
    isPreset: true,
    color: '#6A1B9A',
  },
  {
    id: 'warrior-sociopathy',
    name: 'Warrior Sociopathy',
    base: ['fear', 'distrust'],
    modifier: 'confusion',
    description: 'Dehumanization replaces Curiosity with Distrust, Compassion with Confusion. Committed while confused.',
    isPreset: true,
    color: '#37474F',
  },
];

export const ATOMIC_STATE_MAP = Object.fromEntries(ATOMIC_STATES.map(s => [s.id, s]));

const PRESET_MAP = Object.fromEntries(PRESET_FORMULAS.map((f) => [f.id, f]));

/** An atomic state, or a preset formula used as a modifier (Compassion, Cynicism). */
function resolve(id: string): { label: string; color?: string; description: string } | null {
  const a = ATOMIC_STATE_MAP[id];
  if (a) return a;
  const f = PRESET_MAP[id];
  return f ? { label: f.name, color: f.color, description: f.description ?? '' } : null;
}

export function stateLabel(id: string): string {
  return resolve(id)?.label ?? id;
}

export function deriveFormulaColor(formula: StateFormula): string {
  if (formula.color) return formula.color;
  // The first felt base state gives the colour: it is what the character is in; the modifier is how it shows.
  const felt = formula.base.find((id) => (formula.signs?.[id] ?? 1) === 1) ?? formula.base[0];
  return (felt && resolve(felt)?.color) || (formula.modifier && resolve(formula.modifier)?.color) || '#888888';
}

/** "(Love + Confusion − Hope) × Pride" */
export function formatFormula(f: StateFormula): string {
  const parts = f.base.map((id, i) => {
    const minus = (f.signs?.[id] ?? 1) === -1;
    return `${minus ? '−' : i > 0 ? '+ ' : ''}${minus && i > 0 ? ' ' : ''}${stateLabel(id)}`;
  });
  const base = `(${parts.join(' ').replace(/\s+/g, ' ').trim()})`;
  return f.modifier ? `${base} × ${f.modifierSign === -1 ? '−' : ''}${stateLabel(f.modifier)}` : base;
}

const INTENSITY = { 1: 'an undertone, mostly hidden', 2: 'plain to see', 3: 'overwhelming: it runs the character' } as const;

/**
 * The formula in words, for a prompt: what the character feels, what is missing, and how it comes out.
 * This is the text the AI reads; the symbols alone would mean nothing to it.
 */
export function describeFormula(f: StateFormula): string {
  const felt = f.base.filter((id) => (f.signs?.[id] ?? 1) === 1);
  const missing = f.base.filter((id) => f.signs?.[id] === -1);
  const say = (id: string) => {
    const r = resolve(id);
    return r ? `${r.label} (${r.description.replace(/\.$/, '')})` : id;
  };
  const shown = formatFormula(f);
  const lines = [`${f.name && f.name !== shown && !/^unnamed/i.test(f.name) ? `${f.name}: ` : ''}${shown}`];
  if (felt.length) lines.push(`Feels${felt.length > 1 ? ', at the same time' : ''}: ${felt.map(say).join('; ')}.`);
  if (missing.length) lines.push(`Missing or held down, though the situation calls for it: ${missing.map(say).join('; ')}.`);
  if (f.modifier) {
    lines.push(f.modifierSign === -1
      ? `It never comes out as ${say(f.modifier)}: that channel is closed, so the feeling finds another way out.`
      : `It comes out as ${say(f.modifier)}: this is what others see the character do.`);
  }
  lines.push(`Intensity: ${INTENSITY[f.intensity ?? 2]}.`);
  if (f.description && !f.isPreset) lines.push(`Writer's note: ${f.description}`);
  else if (f.description) lines.push(f.description);
  return lines.join('\n');
}

/** The vocabulary as a prompt block, so the AI can propose formulas from it. */
export const STATE_VOCABULARY = ATOMIC_STATES.map((s) => `${s.id}: ${s.description}`).join('\n');

/**
 * Reads a formula the AI proposed: { base: [ids], missing?: [ids], shows: id | "same", intensity?: 1-3, name?: string }.
 * "shows" (or "modifier") is what others see; when it is one of the felt states there is no modifier.
 * Null when it names no known state.
 */
export function parseProposedFormula(x: unknown): StateFormula | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as { base?: unknown; missing?: unknown; modifier?: unknown; shows?: unknown; intensity?: unknown; name?: unknown };
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((s) => String(s).toLowerCase().trim()))].filter((id) => ATOMIC_STATE_MAP[id]) : []);
  const felt = ids(o.base).slice(0, 3);
  const missing = ids(o.missing).filter((id) => !felt.includes(id)).slice(0, 2);
  if (!felt.length) return null;
  const shown = [o.shows, o.modifier].map((v) => (typeof v === 'string' ? v.toLowerCase().trim() : '')).find((v) => v && resolve(v));
  // When what shows is one of the felt states, it leads the formula (and gives the colour); otherwise it is the modifier.
  if (shown && felt.includes(shown)) felt.splice(0, 0, ...felt.splice(felt.indexOf(shown), 1));
  const modifier = shown && !felt.includes(shown) ? shown : undefined;
  const n = Number(o.intensity);
  const f: StateFormula = {
    id: `ai-${felt.join('-')}${missing.length ? `-no-${missing.join('-')}` : ''}${modifier ? `-x-${modifier}` : ''}`,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : '',
    base: [...felt, ...missing],
    ...(missing.length ? { signs: Object.fromEntries([...felt.map((id) => [id, 1]), ...missing.map((id) => [id, -1])]) as Record<string, 1 | -1> } : {}),
    ...(modifier ? { modifier } : {}),
    intensity: n === 1 || n === 3 ? n : 2,
  };
  if (!f.name) f.name = formatFormula(f);
  f.color = deriveFormulaColor(f);
  return f;
}



/** Reads a formula saved on a node or sent by the editor; null when it is not one. Unknown state ids are dropped. */
export function parseStoredFormula(x: unknown): StateFormula | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Partial<StateFormula>;
  const base = (Array.isArray(o.base) ? o.base : []).map(String).filter((id) => ATOMIC_STATE_MAP[id]).slice(0, 6);
  if (!base.length) return null;
  const signs = o.signs && typeof o.signs === 'object' ? Object.fromEntries(base.filter((id) => o.signs?.[id] === -1 || o.signs?.[id] === 1).map((id) => [id, o.signs![id]])) : undefined;
  const modifier = typeof o.modifier === 'string' && resolve(o.modifier) ? o.modifier : undefined;
  return {
    id: String(o.id ?? ''), name: String(o.name ?? '').slice(0, 80), base,
    ...(signs && Object.keys(signs).length ? { signs } : {}),
    ...(modifier ? { modifier, ...(o.modifierSign === -1 ? { modifierSign: -1 as const } : {}) } : {}),
    ...(typeof o.description === 'string' ? { description: o.description.slice(0, 500) } : {}),
    ...(o.isPreset ? { isPreset: true } : {}),
    ...(o.intensity === 1 || o.intensity === 3 ? { intensity: o.intensity } : {}),
  };
}
