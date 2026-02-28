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
  // Content nodes
  { type: 'plot', label: 'Plot', emoji: '\u{1F4D6}', abbr: 'PL', icon: 'GitBranch', category: 'content', color: '#4A90D9',
    inputs: ['theme', 'world', 'character'], outputs: ['scene', 'chapterAct'] },
  { type: 'character', label: 'Character (Full)', emoji: '\u{1F464}', abbr: 'CH', icon: 'User', category: 'content', color: '#4A90D9',
    inputs: ['artReference', 'musicReference', 'bookReference'], outputs: ['scene', 'script', 'dialogue', 'plot'] },
  { type: 'scene', label: 'Scene (Full)', emoji: '\u{1F3AC}', abbr: 'SC', icon: 'Film', category: 'content', color: '#4A90D9',
    inputs: ['character', 'world', 'plot', 'musicReference', 'artReference'], outputs: ['script', 'dialogue', 'chapterAct'] },
  { type: 'dialogue', label: 'Dialogue', emoji: '\u{1F4AC}', abbr: 'DL', icon: 'MessageSquare', category: 'content', color: '#4A90D9',
    inputs: ['character', 'scene'], outputs: ['script'] },
  { type: 'world', label: 'World / Setting', emoji: '\u{1F30D}', abbr: 'WO', icon: 'Globe', category: 'content', color: '#4A90D9',
    inputs: ['artReference', 'bookReference', 'realEventReference'], outputs: ['scene', 'character', 'plot'] },
  { type: 'theme', label: 'Theme / Motif', emoji: '\u{1F4A1}', abbr: 'TH', icon: 'Sparkles', category: 'content', color: '#4A90D9',
    inputs: ['bookReference', 'realEventReference'], outputs: ['plot', 'character'] },
  { type: 'chapterAct', label: 'Chapter / Act', emoji: '\u{1F4D1}', abbr: 'CA', icon: 'BookOpen', category: 'content', color: '#4A90D9',
    inputs: ['scene', 'plot'], outputs: [] },
  // Character nodes
  { type: 'motivation', label: 'Motivation', emoji: '🔥', abbr: 'MO', icon: 'Flame', category: 'character' as NodeTypeConfig['category'], color: '#f59e0b',
    inputs: ['*'], outputs: ['state', 'character'] },
  // Narrative nodes
  { type: 'arc', label: 'Arc', emoji: '📈', abbr: 'AR', icon: 'TrendingUp', category: 'narrative', color: '#0891b2',
    inputs: ['*'], outputs: ['*'] },
  // Reference nodes
  { type: 'musicReference', label: 'Music Reference', emoji: '\u{1F3B5}', abbr: 'MU', icon: 'Music', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['character', 'scene'] },
  { type: 'bookReference', label: 'Book Reference', emoji: '\u{1F4DA}', abbr: 'BK', icon: 'Library', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['character', 'plot', 'theme'] },
  { type: 'artReference', label: 'Art Reference', emoji: '\u{1F3A8}', abbr: 'AR', icon: 'Palette', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['character', 'scene', 'world'] },
  { type: 'filmReference', label: 'Film Reference', emoji: '\u{1F3A5}', abbr: 'FM', icon: 'Clapperboard', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['scene', 'character', 'plot'] },
  { type: 'realEventReference', label: 'Real Event', emoji: '\u{1F4F0}', abbr: 'RE', icon: 'Landmark', category: 'reference', color: '#E8A838',
    inputs: [], outputs: ['world', 'plot', 'theme'] },
  // Proxy nodes
  { type: 'characterProxy', label: 'Character Proxy', emoji: '\u{1F464}', abbr: 'CP', icon: 'UserCheck', category: 'content', color: '#9B6DD6',
    inputs: ['state'], outputs: ['scene', 'dialogue', 'chapterAct'],
    isProxy: true, proxyFor: 'character' },
  { type: 'sceneProxy', label: 'Scene Proxy', emoji: '\u{1F3AC}', abbr: 'SP', icon: 'Film', category: 'content', color: '#26A69A',
    inputs: ['state'], outputs: ['chapterAct'],
    isProxy: true, proxyFor: 'scene' },
  { type: 'ideasProxy', label: 'Ideas', emoji: '💡', abbr: 'IP', icon: 'Lightbulb', category: 'proxy', color: '#eab308',
    inputs: [], outputs: ['*'],
    isProxy: true },
  { type: 'referencesProxy', label: 'References', emoji: '📑', abbr: 'RP', icon: 'BookMarked', category: 'proxy', color: '#64748b',
    inputs: [], outputs: ['*'],
    isProxy: true },
  { type: 'worldProxy', label: 'World', emoji: '🌐', abbr: 'WP', icon: 'Globe', category: 'proxy', color: '#0ea5e9',
    inputs: [], outputs: ['*'],
    isProxy: true },
  // Meta nodes
  { type: 'state', label: 'State', emoji: '\u{1F3AD}', abbr: 'ST', icon: 'Circle', category: 'meta', color: '#888888',
    inputs: [], outputs: ['characterProxy', 'sceneProxy'] },
  { type: 'aiInstruction', label: 'AI Instruction', emoji: '\u{1F916}', abbr: 'AI', icon: 'Bot', category: 'meta', color: '#9B59B6',
    inputs: ['*'], outputs: ['*'] },
  { type: 'openZone', label: 'Open Zone', emoji: '\u{1F32B}\uFE0F', abbr: 'OZ', icon: 'Hexagon', category: 'meta', color: '#9B59B6',
    inputs: ['*'], outputs: ['*'] },
  { type: 'forkPoint', label: 'Fork Point', emoji: '\u2702\uFE0F', abbr: 'FP', icon: 'Shuffle', category: 'meta', color: '#9B59B6',
    inputs: ['*'], outputs: ['*'] },
  { type: 'aiNode', label: 'AI Agent', emoji: '🤖', abbr: 'AI', icon: 'Bot', category: 'meta', color: '#6366f1',
    inputs: ['*'], outputs: ['*'] },
  // Container nodes (subclouds)
  { type: 'universeCloud', label: 'Universe', emoji: '\u{1F30C}', abbr: 'UN', icon: 'Star', category: 'container', color: '#6366f1',
    isContainer: true,
    inputs: [], outputs: ['characterCloud', 'plotCloud', 'sceneCloud'],
    childNodeTypes: ['world', 'theme', 'musicReference', 'bookReference', 'artReference', 'realEventReference'] },
  { type: 'characterCloud', label: 'Character', emoji: '\u{1F464}', abbr: 'CH', icon: 'Users', category: 'container', color: '#8b5cf6',
    isContainer: true,
    inputs: ['universeCloud'], outputs: ['sceneCloud', 'plotCloud'],
    childNodeTypes: ['character', 'dialogue', 'characterProxy', 'state', 'artReference', 'musicReference'] },
  { type: 'plotCloud', label: 'Plot', emoji: '\u{1F4D6}', abbr: 'PL', icon: 'BookMarked', category: 'container', color: '#3b82f6',
    isContainer: true,
    inputs: ['universeCloud'], outputs: ['sceneCloud'],
    childNodeTypes: ['plot', 'chapterAct', 'theme', 'realEventReference', 'forkPoint'] },
  { type: 'sceneCloud', label: 'Scene', emoji: '\u{1F3AC}', abbr: 'SC', icon: 'Layers', category: 'container', color: '#10b981',
    isContainer: true,
    inputs: ['characterCloud', 'plotCloud'], outputs: [],
    childNodeTypes: ['scene', 'dialogue', 'character', 'sceneProxy', 'characterProxy', 'state', 'aiInstruction'] },
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
  arc: [
    { id: 'input', label: 'Chapter Input', color: '#0891b2', top: '50%' },
  ],
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
    { id: 'chapter',    label: 'Chapter',    type: 'target', position: 'left', color: '#0891b2', offset: '50%' },
    { id: 'output_1',   label: 'Plot 1',     type: 'source', position: 'right', color: '#0891b2', offset: '30%' },
    { id: 'output_2',   label: 'Plot 2',     type: 'source', position: 'right', color: '#0891b2', offset: '50%' },
    { id: 'output_3',   label: 'Plot 3',     type: 'source', position: 'right', color: '#0891b2', offset: '70%' },
  ],
};

export const OUTPUT_HANDLES: Record<string, TypedHandle[]> = {
  arc: [
    { id: 'output', label: 'Chapter Output', color: '#0891b2', top: '50%' },
  ],
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
