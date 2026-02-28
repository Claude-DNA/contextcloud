export interface NodeTypeConfig {
  type: string;
  label: string;
  emoji: string;
  abbr: string;
  icon: string; // Lucide icon component name
  category: 'content' | 'reference' | 'meta' | 'container' | 'character' | 'proxy';
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
  chapterAct: [
    { id: 'scenes', label: 'Scenes', color: '#10b981', top: '25%' },
    { id: 'characters', label: 'Characters', color: '#8b5cf6', top: '50%' },
    { id: 'plot', label: 'Plot', color: '#3b82f6', top: '75%' },
  ],
  plot: [
    { id: 'characters', label: 'Characters', color: '#8b5cf6', top: '25%' },
    { id: 'prev_plot', label: 'Prev Plot', color: '#3b82f6', top: '50%' },
    { id: 'universe', label: 'Universe', color: '#6366f1', top: '75%' },
  ],
  scene: [
    { id: 'characters', label: 'Characters', color: '#8b5cf6', top: '20%' },
    { id: 'prev_scene', label: 'Prev Scene', color: '#10b981', top: '40%' },
    { id: 'plot', label: 'Plot', color: '#3b82f6', top: '60%' },
    { id: 'world', label: 'World', color: '#64748b', top: '80%' },
  ],
  motivation: [
    { id: 'trigger', label: 'Trigger Event', color: '#ef4444', top: '50%' },
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
