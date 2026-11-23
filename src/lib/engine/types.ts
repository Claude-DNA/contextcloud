/**
 * Character State Engine — types.
 * Spec: "Character State Engine: Spec v2.1". Everything here is plain data so a story can be saved,
 * sent to the server and simulated the same way every time.
 */

/** Who gains and who loses: character id (or WORLD) → −1…+1. */
export type Effect = Record<string, number>;
export const WORLD = 'world';

// ── Identity: who the character is in any story (the portable .character.json file) ──

export const CHARACTER_SCHEMA = 'contextcloud.character/0.1';

export interface Drive { drive: string; weight: number }
export interface Fear { fear: string; weight: number }
export interface Wound {
  wound: string;
  /** A carried feeling: resentment, hate, guilt, grief, longing or love. */
  feeling: string;
  significance: number;
  /** A role such as "father"; on import the author says which character, if any, plays it. */
  targetRole?: string;
}
export interface ReferenceWeight { reference: string; weight: number }

export interface Identity {
  schema: typeof CHARACTER_SCHEMA;
  id: string;
  name: string;
  summary?: string;
  drives: Drive[];
  fears: Fear[];
  values: string[];
  contradictions: { between: [string, string]; note?: string }[];
  temperament: {
    /** Resting level of passing feelings, 0…1. */
    baseline: Record<string, number>;
    /** How strongly each passing feeling rises for this character, 0…1 (0.5 = average). */
    sensitivity: Record<string, number>;
  };
  conscience: number;
  /** Where they think they stand on Good–Evil, −1…+1. */
  selfImage: number;
  selfControl: number;
  /** 0 easy-going … 1 stubborn; per carried feeling overrides allowed. */
  persistence: { overall: number } & Record<string, number>;
  /** 0 predictable (Dreiser, Picard) … 1 unpredictable (Dostoevsky); a value or a cast of references. */
  temperature: { value?: number; cast?: ReferenceWeight[] };
  history: Wound[];
}

// ── Instance: the character in one story ──

export interface Agenda {
  id: string;
  label: string;
  effect: Effect;
  /** Weight among the real agendas; ignored on the declared agenda. */
  weight: number;
}

export interface Instance {
  identity: Identity;
  declared: Agenda | null;
  real: Agenda[];
  /** History wound role → character id in this story. */
  roles?: Record<string, string>;
}

// ── Scenes: what the author approved for each beat ──

export type EventKind =
  | 'happening' // something happens that moves goals: progress or a block
  | 'wrong' // a wrong done to someone, not acknowledged
  | 'kindness'
  | 'loss'
  | 'apology' // the person who did a wrong acknowledges it
  | 'betrayal'
  | 'reminder' // touches an old wound
  | 'threat' // a channel for coercion
  | 'lie' // a channel for manipulation
  | 'contact'; // they met or talked: a channel for influence

export interface StoryEvent {
  id: string;
  label: string;
  kind: EventKind;
  /** Who caused it, when a person did. */
  by?: string;
  /** Who it is aimed at or touches most. */
  target?: string;
  effect: Effect;
  /** How big it is, 0…1. */
  size: number;
  /** Characters who know about it; empty = everyone present. */
  witnesses?: string[];
}

export type Branch = 'heroic' | 'despair' | 'rage';

export interface Deed {
  id: string;
  actor: string;
  label: string;
  effect: Effect;
  /** How visible to others, 0…1. */
  visibility: number;
  witnesses?: string[];
  kind?: 'act' | 'apology' | 'confession' | 'amends';
  /** The actor's own belief that it will work, 0…1. */
  odds?: number;
  risk?: number;
  effort?: number;
  /** How much the deed matters to the plot, 0…1. */
  plotWeight?: number;
  /** A real choice between goals: agenda weights move only at these. */
  choice?: boolean;
  /** The author confirmed someone pushed the actor: coercion or manipulation. */
  forcedBy?: string;
  pressure?: number;
  /** When the actor saw no way to succeed: which way they went. */
  branch?: Branch;
}

export interface Beat {
  id: string;
  title: string;
  /** Characters in the scene. */
  present: string[];
  events: StoryEvent[];
  deeds: Deed[];
  /** The scene is a flashback or flash-forward: drawn, but its results are not carried on. */
  flash?: boolean;
}

export interface Settings {
  seed: number;
  /** Deeds against agendas in Good–Evil, 0…1. */
  alpha: number;
  /** Direction against size in distances. */
  lambda: number;
  /** Moral weight per character id and WORLD; missing = 1. */
  moralWeights: Record<string, number>;
  /** The story's default temperature, used when a character has none. */
  storyTemperature: number;
  /** Silent while drafting: flags only on request. */
  drafting: boolean;
  /** Questions shown per scene. */
  flagBudget: number;
}

export const DEFAULT_SETTINGS: Settings = {
  seed: 1,
  alpha: 0.5,
  lambda: 0.7,
  moralWeights: {},
  storyTemperature: 0.35,
  drafting: false,
  flagBudget: 3,
};

export interface Story {
  characters: Record<string, Instance>;
  /** Display names. */
  names: Record<string, string>;
  beats: Beat[];
  settings: Settings;
}

// ── Results ──

export type FlagCode =
  | 'undermotivated'
  | 'overmotivated-idle'
  | 'out-of-type'
  | 'driven-from-outside'
  | 'unexplained-beneficiary'
  | 'plot-hole'
  | 'unearned-change'
  | 'flat'
  | 'spiral'
  | 'dormant-wound'
  | 'pivot'
  | 'exposure'
  | 'leak'
  | 'open-account'
  | 'ambiguous-deed'
  | 'avoidance';

export interface Flag {
  code: FlagCode;
  beat: number;
  character: string;
  deed?: string;
  /** Plain-language question for the writer. */
  message: string;
  suggestion?: string;
  severity: number;
  /** Notes are recorded but never count against the budget. */
  note?: boolean;
  /** Shown under the budget (false = waiting in the drawer). */
  shown?: boolean;
  /** Filled for ambiguity and suggested sources. */
  data?: Record<string, unknown>;
}

export interface Balance { target: string; feeling: string; intensity: number; significance: number }

export interface CharacterSnapshot {
  good: number; // true position, Good–Evil
  shown: number; // as others see it
  selfImage: number;
  love: number; // Love–Fear
  honesty: number;
  deception: number;
  hypocrisy: number;
  selfBetrayal: number;
  conflict: number;
  temperature: number;
  agendaWeights: Record<string, number>;
  feelings: { id: string; value: number; target?: string }[];
  ledger: Balance[];
  /** What others believe: observer id → trust in this character. */
  trust: Record<string, number>;
  present: boolean;
}

export interface DeedReport {
  beat: number;
  deed: string;
  actor: string;
  label: string;
  motivation: number;
  inner: number;
  outside: number;
  cost: number;
  ratio: number;
  chance: number;
  served?: string;
  ambiguous?: string[];
  meaning: number;
  want: number;
  stakes: number;
  odds: number;
  moralCost: number;
  branchChances?: Record<Branch, number>;
}

export interface RunResult {
  seed: number;
  beats: { id: string; title: string; characters: Record<string, CharacterSnapshot> }[];
  deeds: DeedReport[];
  flags: Flag[];
}
