export interface NodeTypeConfig {
  type: string;
  label: string;
  emoji: string;
  abbr: string;
  icon: string; // Lucide icon component name
  category: 'content' | 'reference' | 'meta' | 'container' | 'character' | 'proxy' | 'narrative';
  color: string;
  inputs: string[]; // '*' means any
  outputs: string[]; // '*' means any
  isProxy?: boolean;
  proxyFor?: string; // the big node type this proxies
  isContainer?: boolean;
  childNodeTypes?: string[];
  hidden?: boolean; // if true, not shown in the node palette (still renderable)
}

export const STATE_COLORS = {
  red:    { hex: '#E53935', label: 'angry / rage' },
  yellow: { hex: '#FDD835', label: 'anxious / nervous' },
  blue:   { hex: '#1E88E5', label: 'sad / melancholic' },
  green:  { hex: '#43A047', label: 'hopeful' },
  grey:   { hex: '#757575', label: 'numb / dissociated' },
  purple: { hex: '#8E24AA', label: 'mysterious' },
};

export const NODE_TYPES: NodeTypeConfig[] = [
  // ── STORY NODES (visible in palette) ────────────────────────────────────────
  { type: 'scene', label: 'Scene', emoji: '\u{1F3AC}', abbr: 'SC', icon: 'Film', category: 'content', color: '#3b82f6',
    inputs: ['character', 'world', 'theme', 'bookReference', 'filmReference', 'musicReference', 'artReference'], outputs: ['scene'] },
  { type: 'character', label: 'Character', emoji: '\u{1F464}', abbr: 'CH', icon: 'User', category: 'content', color: '#8b5cf6',
    inputs: ['bookReference', 'artReference', 'musicReference'], outputs: ['charactersProxy'] },
  { type: 'world', label: 'World', emoji: '\u{1F30D}', abbr: 'WO', icon: 'Globe', category: 'content', color: '#0ea5e9',
    inputs: ['bookReference', 'artReference', 'realEventReference'], outputs: ['scene'] },
  { type: 'theme', label: 'Theme / Idea', emoji: '\u{1F4A1}', abbr: 'TH', icon: 'Sparkles', category: 'content', color: '#f59e0b',
    inputs: ['bookReference', 'realEventReference'], outputs: ['scene'] },

  // ── CHARACTER PATTERN (visible in palette) ───────────────────────────────────
  { type: 'charactersProxy', label: 'Character Proxy', emoji: '\u{1F464}', abbr: 'CP', icon: 'UserCheck', category: 'proxy', color: '#6366f1',
    inputs: ['character'], outputs: ['state'],
    isProxy: true, proxyFor: 'character' },
  { type: 'state', label: 'State', emoji: '\u{1F3AD}', abbr: 'ST', icon: 'Circle', category: 'meta', color: '#888888',
    inputs: ['charactersProxy'], outputs: ['scene'] },

  // ── REFERENCES (visible in palette) ─────────────────────────────────────────
  { type: 'bookReference', label: 'Book', emoji: '\u{1F4DA}', abbr: 'BK', icon: 'Library', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['character', 'scene', 'world', 'theme'] },
  { type: 'filmReference', label: 'Film', emoji: '\u{1F3A5}', abbr: 'FM', icon: 'Clapperboard', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['scene', 'character'] },
  { type: 'musicReference', label: 'Music', emoji: '\u{1F3B5}', abbr: 'MU', icon: 'Music', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['character', 'scene'] },
  { type: 'artReference', label: 'Art', emoji: '\u{1F3A8}', abbr: 'AR', icon: 'Palette', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['character', 'scene', 'world'] },
  { type: 'realEventReference', label: 'Real Event', emoji: '\u{1F4F0}', abbr: 'RE', icon: 'Landmark', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['world', 'theme'] },

  // ── LEGACY / INTERNAL (hidden from palette, still render correctly) ──────────
  { type: 'plot', label: 'Plot', emoji: '\u{1F4D6}', abbr: 'PL', icon: 'GitBranch', category: 'content', color: '#4A90D9',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'dialogue', label: 'Dialogue', emoji: '\u{1F4AC}', abbr: 'DL', icon: 'MessageSquare', category: 'content', color: '#4A90D9',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'chapterAct', label: 'Chapter / Act', emoji: '\u{1F4D1}', abbr: 'CA', icon: 'BookOpen', category: 'content', color: '#ec4899',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'motivation', label: 'Motivation', emoji: '🔥', abbr: 'MO', icon: 'Flame', category: 'character' as NodeTypeConfig['category'], color: '#f59e0b',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'arc', label: 'Arc', emoji: '📈', abbr: 'AR', icon: 'TrendingUp', category: 'narrative', color: '#0891b2',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'chapterPlot', label: 'Plot (Chapter)', emoji: '📖', abbr: 'CP', icon: 'GitBranch', category: 'narrative', color: '#4A90D9',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'characterProxy', label: 'Character Proxy (legacy)', emoji: '\u{1F464}', abbr: 'CP', icon: 'UserCheck', category: 'content', color: '#9B6DD6',
    hidden: true, inputs: ['*'], outputs: ['*'], isProxy: true, proxyFor: 'character' },
  { type: 'sceneProxy', label: 'Scene Proxy', emoji: '\u{1F3AC}', abbr: 'SP', icon: 'Film', category: 'content', color: '#26A69A',
    hidden: true, inputs: ['*'], outputs: ['*'], isProxy: true, proxyFor: 'scene' },
  { type: 'ideasProxy', label: 'Ideas', emoji: '💡', abbr: 'IP', icon: 'Lightbulb', category: 'proxy', color: '#eab308',
    hidden: true, inputs: ['*'], outputs: ['*'], isProxy: true },
  { type: 'referencesProxy', label: 'References', emoji: '📑', abbr: 'RP', icon: 'BookMarked', category: 'proxy', color: '#64748b',
    hidden: true, inputs: ['*'], outputs: ['*'], isProxy: true },
  { type: 'worldProxy', label: 'World', emoji: '🌐', abbr: 'WP', icon: 'Globe', category: 'proxy', color: '#0ea5e9',
    hidden: true, inputs: ['*'], outputs: ['*'], isProxy: true },
  { type: 'aiInstruction', label: 'AI Instruction', emoji: '\u{1F916}', abbr: 'AI', icon: 'Bot', category: 'meta', color: '#9B59B6',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'openZone', label: 'Open Zone', emoji: '\u{1F32B}\uFE0F', abbr: 'OZ', icon: 'Hexagon', category: 'meta', color: '#9B59B6',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'forkPoint', label: 'Fork Point', emoji: '\u2702\uFE0F', abbr: 'FP', icon: 'Shuffle', category: 'meta', color: '#9B59B6',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'aiNode', label: 'AI Agent', emoji: '🤖', abbr: 'AI', icon: 'Bot', category: 'meta', color: '#6366f1',
    hidden: true, inputs: ['*'], outputs: ['*'] },
  { type: 'universeCloud', label: 'Universe', emoji: '\u{1F30C}', abbr: 'UN', icon: 'Star', category: 'container', color: '#6366f1',
    hidden: true, isContainer: true, inputs: [], outputs: [] },
  { type: 'characterCloud', label: 'Character', emoji: '\u{1F464}', abbr: 'CH', icon: 'Users', category: 'container', color: '#8b5cf6',
    hidden: true, isContainer: true, inputs: [], outputs: [] },
  { type: 'plotCloud', label: 'Plot', emoji: '\u{1F4D6}', abbr: 'PL', icon: 'BookMarked', category: 'container', color: '#3b82f6',
    hidden: true, isContainer: true, inputs: [], outputs: [] },
  { type: 'sceneCloud', label: 'Scene', emoji: '\u{1F3AC}', abbr: 'SC', icon: 'Layers', category: 'container', color: '#10b981',
    hidden: true, isContainer: true, inputs: [], outputs: [] },
];

export const NODE_TYPE_MAP = Object.fromEntries(NODE_TYPES.map(n => [n.type, n]));

// Typed multi-handle definitions for n8n-style nodes
export interface TypedHandle {
  id: string;
  label: string;
  color: string;
  top: string;
}

export const TYPED_HANDLES: Record<string, TypedHandle[]> = {
  motivation: [
    { id: 'trigger', label: 'Trigger Event', color: '#ef4444', top: '50%' },
  ],
};

// 4-directional hub handle config for narrative nodes
export interface HubHandleConfig {
  id: string;
  label: string;
  type: 'source' | 'target';
  position: 'top' | 'right' | 'left' | 'bottom';
  color: string;
  offset?: string; // percentage for stacking multiple handles on same side
}

// All inputs LEFT, single output RIGHT — clean n8n pattern
export const HUB_HANDLES: Record<string, HubHandleConfig[]> = {
  chapterPlot: [
    // LEFT: pipeline input (entry from previous plot)
    { id: 'input',      label: 'Input',      type: 'target', position: 'left',   color: '#4A90D9', offset: '50%' },
    // TOP: content context flows DOWN into plot
    { id: 'characters', label: 'Characters', type: 'target', position: 'top',    color: '#8b5cf6', offset: '25%' },
    { id: 'scenes',     label: 'Scenes',     type: 'target', position: 'top',    color: '#10b981', offset: '50%' },
    { id: 'references', label: 'References', type: 'target', position: 'top',    color: '#64748b', offset: '75%' },
    // BOTTOM: cloud proxies flow UP into plot
    { id: 'ai',         label: 'AI',         type: 'target', position: 'bottom', color: '#6366f1', offset: '20%' },
    { id: 'world',      label: 'World',      type: 'target', position: 'bottom', color: '#0ea5e9', offset: '50%' },
    { id: 'ideas',      label: 'Ideas',      type: 'target', position: 'bottom', color: '#eab308', offset: '80%' },
    // RIGHT: pipeline output (to next plot)
    { id: 'output',     label: 'Output',     type: 'source', position: 'right',  color: '#4A90D9', offset: '50%' },
  ],
  chapterAct: [
    // Top: References (left) + Arc (right)
    { id: 'references', label: 'References', type: 'target', position: 'top', color: '#64748b', offset: '30%' },
    { id: 'arc',        label: 'Arc',        type: 'target', position: 'top', color: '#0891b2', offset: '70%' },
    // Left: In (prev chapter)
    { id: 'prev_chapter', label: 'In',  type: 'target', position: 'left',  color: '#3b82f6', offset: '50%' },
    // Right: Out (next chapter)
    { id: 'next_chapter', label: 'Out', type: 'source', position: 'right', color: '#3b82f6', offset: '50%' },
    // Bottom: AI + World + Ideas
    { id: 'ai',    label: 'AI',    type: 'target', position: 'bottom', color: '#6366f1', offset: '20%' },
    { id: 'world', label: 'World', type: 'target', position: 'bottom', color: '#0ea5e9', offset: '50%' },
    { id: 'ideas', label: 'Ideas', type: 'target', position: 'bottom', color: '#eab308', offset: '80%' },
  ],
  plot: [
    { id: 'arc_point',  label: 'Arc Point',  type: 'target', position: 'left', color: '#0891b2', offset: '12%' },
    { id: 'prev_plot',  label: 'Prev Plot',  type: 'target', position: 'left', color: '#3b82f6', offset: '25%' },
    { id: 'characters', label: 'Characters', type: 'target', position: 'left', color: '#8b5cf6', offset: '38%' },
    { id: 'scenes',     label: 'Scenes',     type: 'target', position: 'left', color: '#10b981', offset: '50%' },
    { id: 'references', label: 'References', type: 'target', position: 'left', color: '#64748b', offset: '63%' },
    { id: 'ai',         label: 'AI',         type: 'target', position: 'left', color: '#6366f1', offset: '75%' },
    { id: 'world',      label: 'World',      type: 'target', position: 'left', color: '#0ea5e9', offset: '88%' },
    { id: 'output',     label: 'Output',     type: 'source', position: 'right', color: '#3b82f6', offset: '50%' },
  ],
  scene: [
    { id: 'prev_scene', label: 'Prev Scene', type: 'target', position: 'left', color: '#10b981', offset: '14%' },
    { id: 'characters', label: 'Characters', type: 'target', position: 'left', color: '#8b5cf6', offset: '29%' },
    { id: 'plot',       label: 'Plot',       type: 'target', position: 'left', color: '#3b82f6', offset: '43%' },
    { id: 'references', label: 'References', type: 'target', position: 'left', color: '#64748b', offset: '57%' },
    { id: 'ai',         label: 'AI',         type: 'target', position: 'left', color: '#6366f1', offset: '71%' },
    { id: 'world',      label: 'World',      type: 'target', position: 'left', color: '#0ea5e9', offset: '86%' },
    { id: 'output',     label: 'Output',     type: 'source', position: 'right', color: '#10b981', offset: '50%' },
  ],
  arc: [
    { id: 'chapters_out', label: 'Chapters →', type: 'source', position: 'right', color: '#0891b2', offset: '50%' },
  ],
};

export const OUTPUT_HANDLES: Record<string, TypedHandle[]> = {
  motivation: [
    { id: 'state', label: '→ State', color: '#f59e0b', top: '35%' },
    { id: 'character', label: '→ Character', color: '#8b5cf6', top: '65%' },
  ],
};

export const AI_NODE_CONFIG = {
  availableModels: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet', provider: 'Anthropic' },
    { id: 'claude-opus-4-5', label: 'Claude Opus', provider: 'Anthropic' },
    { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
    { id: 'gpt-4', label: 'GPT-4', provider: 'OpenAI' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'Google' },
    { id: 'gemini-pro', label: 'Gemini Pro', provider: 'Google' },
  ],
  defaultModel: 'gemini-2.0-flash',
  providerUrls: {
    Anthropic: 'https://console.anthropic.com/settings/keys',
    OpenAI: 'https://platform.openai.com/api-keys',
    Google: 'https://aistudio.google.com/apikey',
  } as Record<string, string>,
};

// --- States Model ---

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
  { id: 'hope',      label: 'Hope',      axis: 'love',    color: '#4CAF50', description: 'Love - logic; belief despite evidence' },
  { id: 'joy',       label: 'Joy',       axis: 'love',    color: '#FFD600', description: 'Present-tense positive state' },
  { id: 'wonder',    label: 'Wonder',    axis: 'love',    color: '#29B6F6', description: 'Passive openness to the unknown' },
  { id: 'curiosity', label: 'Curiosity', axis: 'active',  color: '#26C6DA', description: 'Active pursuit of the unknown (not Wonder)' },
  // Fear axis
  { id: 'fear',      label: 'Fear',      axis: 'fear',    color: '#1565C0', description: 'Exposure to unknown × self-preservation; default state' },
  { id: 'despair',   label: 'Despair',   axis: 'fear',    color: '#263238', description: 'Fear - logic; hopelessness despite evidence' },
  { id: 'rage',      label: 'Rage',      axis: 'active',  color: '#B71C1C', description: 'Reactive force; present-tense' },
  { id: 'disgust',   label: 'Disgust',   axis: 'fear',    color: '#558B2F', description: 'Boundary enforcement, rejection' },
  { id: 'distrust',  label: 'Distrust',  axis: 'fear',    color: '#37474F', description: 'Not believing in others\' intentions' },
  { id: 'confusion', label: 'Confusion', axis: 'neutral', color: '#757575', description: 'Epistemic zero-vector; Soul-Mind disconnection' },
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
  modifier?: string;                  // atomic state id (optional)
  modifierSign?: 1 | -1;              // modifier can also be negated
  description?: string;
  isPreset?: boolean;
  color?: string;       // display color (auto-derived if empty)
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
    description: 'Fear keeps stakes real. Curiosity sees clearly. Compassion as modifier: Pride − Fear = Honor.',
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

export function deriveFormulaColor(formula: StateFormula): string {
  if (formula.color) return formula.color;
  // Derive from dominant base state
  const dominant = formula.modifier
    ? ATOMIC_STATE_MAP[formula.modifier]
    : formula.base.length > 0 ? ATOMIC_STATE_MAP[formula.base[0]] : null;
  return dominant?.color || '#888888';
}

const LIBRARY_KEY = 'contextube_state_library';

export function loadStateLibrary(): StateFormula[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveToStateLibrary(formula: StateFormula): StateFormula[] {
  const lib = loadStateLibrary().filter(f => f.id !== formula.id);
  const updated = [formula, ...lib];
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
  return updated;
}

export function deleteFromStateLibrary(id: string): StateFormula[] {
  const updated = loadStateLibrary().filter(f => f.id !== id);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
  return updated;
}
