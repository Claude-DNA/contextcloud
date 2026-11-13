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

  // ── CAUSAL PROPAGATION NODES (auto-generated, hidden from palette) ───────────
  { type: 'stateIn',  label: 'State In',   emoji: '→', abbr: 'SI', icon: 'Circle',    category: 'meta',    color: '#a78bfa',
    hidden: true, inputs: ['charactersProxy'], outputs: ['scene'] },
  { type: 'stateOut', label: 'State Out',  emoji: '↗', abbr: 'SO', icon: 'TrendingUp', category: 'meta',   color: '#7c3aed',
    hidden: true, inputs: ['scene'], outputs: [] },
  { type: 'stageIn',  label: 'Stage In',   emoji: '→', abbr: 'SI', icon: 'MapPin',    category: 'content', color: '#38bdf8',
    hidden: true, inputs: [], outputs: ['scene'] },
  { type: 'stageOut', label: 'Stage Out',  emoji: '↗', abbr: 'SO', icon: 'MapPin',    category: 'content', color: '#0891b2',
    hidden: true, inputs: ['scene'], outputs: [] },
  { type: 'worldIn',  label: 'World In',   emoji: '→', abbr: 'WI', icon: 'Globe',     category: 'content', color: '#34d399',
    hidden: true, inputs: [], outputs: ['scene'] },
  { type: 'worldOut', label: 'World Out',  emoji: '↗', abbr: 'WO', icon: 'Globe',     category: 'content', color: '#059669',
    hidden: true, inputs: ['scene'], outputs: [] },

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
    { id: 'prev_scene', label: 'Prev Scene',  type: 'target', position: 'left',   color: '#10b981', offset: '50%' },
    { id: 'characters', label: 'Characters',  type: 'target', position: 'top',    color: '#8b5cf6', offset: '25%' },
    { id: 'plot',       label: 'Themes',      type: 'target', position: 'top',    color: '#3b82f6', offset: '50%' },
    { id: 'references', label: 'References',  type: 'target', position: 'top',    color: '#64748b', offset: '75%' },
    { id: 'world',      label: 'World',       type: 'target', position: 'bottom', color: '#0ea5e9', offset: '33%' },
    { id: 'ai',         label: 'AI',          type: 'target', position: 'bottom', color: '#6366f1', offset: '67%' },
    { id: 'output',     label: 'Next Scene',  type: 'source', position: 'right',  color: '#10b981', offset: '50%' },
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

/**
 * AI nodes use the provider, key and model chosen in Settings. A node may pick another model from
 * that provider's list; an empty model means "the default from Settings".
 */
export const AI_NODE_CONFIG = {
  defaultLabel: 'Default model',
};

// --- States Model --- lives in @/lib/state-formula so the server can use it too.
export * from '@/lib/state-formula';
import type { StateFormula } from '@/lib/state-formula';

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

/**
 * The library lives on the account; the browser copy is a cache so the panel opens instantly.
 * Formulas saved in this browser before accounts kept them are sent up the first time.
 */
export async function syncStateLibrary(): Promise<StateFormula[]> {
  const local = loadStateLibrary();
  try {
    const res = await fetch('/api/v1/user/state-library');
    if (!res.ok) return local;
    const server = ((await res.json()).formulas ?? []) as StateFormula[];
    const extra = local.filter((f) => !server.some((s) => s.id === f.id));
    const all = [...server, ...extra];
    if (extra.length) await pushStateLibrary(all);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(all));
    return all;
  } catch {
    return local;
  }
}

export async function pushStateLibrary(formulas: StateFormula[]): Promise<void> {
  try {
    await fetch('/api/v1/user/state-library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formulas }) });
  } catch {
    // The browser copy stays; the next sync sends it up.
  }
}
