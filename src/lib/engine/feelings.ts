/**
 * Character State Engine — the feelings it tracks.
 * Studio's atomic states, plus Resentment and Hate, which the engine needs as carried feelings
 * (in the formula vocabulary they are presets, built from Pride, Confusion and Rage).
 */

export type FeelingKind = 'passing' | 'carried';

export interface FeelingInfo {
  id: string;
  label: string;
  kind: FeelingKind;
  /** Contribution to Love–Fear: +1 love side, −1 fear side. */
  side: number;
  /** Felt toward someone (love, rage) or in general (hope, calm). */
  targeted: boolean;
  /** Outward feelings feed the meaning of a deed and the heroic branch. */
  outward?: boolean;
}

export const FEELINGS: FeelingInfo[] = [
  { id: 'love', label: 'Love', kind: 'carried', side: 1, targeted: true, outward: true },
  { id: 'hope', label: 'Hope', kind: 'passing', side: 0.8, targeted: false },
  { id: 'joy', label: 'Joy', kind: 'passing', side: 0.7, targeted: false },
  { id: 'wonder', label: 'Wonder', kind: 'passing', side: 0.5, targeted: false },
  { id: 'curiosity', label: 'Curiosity', kind: 'passing', side: 0.5, targeted: false, outward: true },
  { id: 'fear', label: 'Fear', kind: 'passing', side: -1, targeted: false },
  { id: 'despair', label: 'Despair', kind: 'passing', side: -1, targeted: false },
  { id: 'rage', label: 'Rage', kind: 'passing', side: -0.6, targeted: true },
  { id: 'ambition', label: 'Ambition', kind: 'passing', side: 0, targeted: false },
  { id: 'disgust', label: 'Disgust', kind: 'passing', side: -0.6, targeted: true },
  { id: 'distrust', label: 'Distrust', kind: 'passing', side: -0.8, targeted: true },
  { id: 'confusion', label: 'Confusion', kind: 'passing', side: -0.2, targeted: false },
  { id: 'calm', label: 'Calm', kind: 'passing', side: 0, targeted: false },
  { id: 'shame', label: 'Shame', kind: 'passing', side: -0.5, targeted: false },
  { id: 'pride', label: 'Pride', kind: 'passing', side: -0.4, targeted: false },
  { id: 'envy', label: 'Envy', kind: 'passing', side: -0.3, targeted: true },
  { id: 'guilt', label: 'Guilt', kind: 'carried', side: 0.4, targeted: true },
  { id: 'grief', label: 'Grief', kind: 'carried', side: 0.4, targeted: true },
  { id: 'longing', label: 'Longing', kind: 'carried', side: 0.5, targeted: true },
  { id: 'resentment', label: 'Resentment', kind: 'carried', side: -0.8, targeted: true },
  { id: 'hate', label: 'Hate', kind: 'carried', side: -1, targeted: true },
];

export const FEELING = Object.fromEntries(FEELINGS.map((f) => [f.id, f])) as Record<string, FeelingInfo>;
export const CARRIED = FEELINGS.filter((f) => f.kind === 'carried').map((f) => f.id);
export const PASSING = FEELINGS.filter((f) => f.kind === 'passing').map((f) => f.id);

/** Passing feeling (toward B) → the carried stock it feeds (toward B), with its conversion rate k. */
export const INFLOW: { from: string; to: string; k: number }[] = [
  { from: 'rage', to: 'resentment', k: 0.25 },
  { from: 'disgust', to: 'hate', k: 0.2 },
  { from: 'joy', to: 'love', k: 0.25 },
  { from: 'shame', to: 'guilt', k: 0.5 },
];

/** Feedback β per carried feeling: how much an unresolved balance bends the reading of new events. */
export const BETA: Record<string, number> = { resentment: 0.8, hate: 0.6, love: 0.5, guilt: 0.4, grief: 0.3, longing: 0.3 };

/** A balance that reaches significance this high, from below, is a breaking point. */
export const BREAK_THRESHOLD = 0.85;

/** Formula ids for display: Resentment and Hate show as the atomic states they come out as. */
export const DISPLAY_AS: Record<string, string> = { resentment: 'rage', hate: 'disgust' };
