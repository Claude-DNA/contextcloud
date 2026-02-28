'use client';

import { useCallback, useState, useContext, useMemo } from 'react';
import { type Node, type Edge } from '@xyflow/react';
import { NODE_TYPE_MAP, STATE_COLORS, TYPED_HANDLES, AI_NODE_CONFIG } from './nodeTypes';
import { GraphContext } from './GraphContext';
import { type LucideProps } from 'lucide-react';
import * as Icons from 'lucide-react';

function getIcon(name?: string): React.ComponentType<LucideProps> | null {
  if (!name) return null;
  return (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name] || null;
}

export interface NodePanelProps {
  node: Node | null;
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
  onUpdate: (nodeId: string, field: string, value: unknown) => void;
  onDelete?: (nodeId: string) => void;
}

const CONTENT_HINTS: Record<string, string> = {
  character: 'Describe this character — personality, appearance, backstory...',
  scene: 'Describe what happens in this scene...',
  plot: 'Outline the plot arc, key beats, and stakes...',
  dialogue: 'Write dialogue lines, blocking, or speech patterns...',
  world: 'Describe the world — geography, culture, rules...',
  theme: 'Explore the theme — what it means, how it manifests...',
  chapterAct: 'Outline what happens in this chapter or act...',
  aiInstruction: 'Write instructions for the AI to follow...',
  openZone: 'Describe what this open zone represents...',
  forkPoint: 'Describe the branching point and possible paths...',
  motivation: 'Describe the motivation — what drives this character or moment...',
};

/* Small icon badge for connection items */
function MiniIconBadge({ color, type }: { color: string; type: string }) {
  const config = NODE_TYPE_MAP[type];
  const IconComp = getIcon(config?.icon);
  return (
    <div
      className="rounded flex items-center justify-center shrink-0"
      style={{ backgroundColor: color, width: 20, height: 20 }}
    >
      {IconComp ? <IconComp size={12} strokeWidth={2} className="text-white" /> : (
        <span className="text-[7px] font-bold text-white">{config?.abbr || '??'}</span>
      )}
    </div>
  );
}

export default function NodePanel({ node, nodes, edges, onClose, onUpdate, onDelete }: NodePanelProps) {
  const isOpen = !!node;
  const config = node ? NODE_TYPE_MAP[(node.data?.type as string) || node.type || ''] : null;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [addingElement, setAddingElement] = useState(false);
  const [newElementLabel, setNewElementLabel] = useState('');
  const [newElementNote, setNewElementNote] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const { bigNodes, onParentChange } = useContext(GraphContext);

  const d = node?.data as Record<string, unknown> | undefined;
  const title = (d?.title as string) || '';
  const content = (d?.content as string) || '';
  const label = (d?.label as string) || config?.label || '';
  const color = (d?.color as string) || config?.color || '#6b7280';
  const stateColor = (d?.stateColor as string) || '';
  const isProxy = !!d?.isProxy;
  const parentNodeId = (d?.parentNodeId as string) || '';
  const thumbnail = (d?.thumbnail as string) || '';
  const externalUrl = (d?.externalUrl as string) || '';
  const externalTitle = (d?.externalTitle as string) || '';
  const source = (d?.source as string) || '';
  const nodeType = (d?.type as string) || node?.type || '';

  const isReference = ['musicReference', 'bookReference', 'artReference', 'filmReference', 'realEventReference'].includes(nodeType);
  const isState = nodeType === 'state';
  const isContainer = !!config?.isContainer;

  // Compute incoming / outgoing connections
  const incomingConnections = useMemo(() => {
    if (!node) return [];
    return edges
      .filter(e => e.target === node.id)
      .map(e => {
        const sourceNode = nodes.find(n => n.id === e.source);
        const sourceType = (sourceNode?.data?.type as string) || sourceNode?.type || '';
        const sourceConfig = NODE_TYPE_MAP[sourceType];
        return {
          id: e.id,
          nodeId: e.source,
          title: (sourceNode?.data?.title as string) || sourceConfig?.label || 'Untitled',
          type: sourceType,
          color: (sourceNode?.data?.color as string) || sourceConfig?.color || '#6b7280',
          handleId: e.targetHandle || null,
        };
      });
  }, [node, nodes, edges]);

  const outgoingConnections = useMemo(() => {
    if (!node) return [];
    return edges
      .filter(e => e.source === node.id)
      .map(e => {
        const targetNode = nodes.find(n => n.id === e.target);
        const targetType = (targetNode?.data?.type as string) || targetNode?.type || '';
        const targetConfig = NODE_TYPE_MAP[targetType];
        return {
          id: e.id,
          nodeId: e.target,
          title: (targetNode?.data?.title as string) || targetConfig?.label || 'Untitled',
          type: targetType,
          color: (targetNode?.data?.color as string) || targetConfig?.color || '#6b7280',
        };
      });
  }, [node, nodes, edges]);

  // For typed-handle nodes, group inputs by handle
  const typedHandles = nodeType ? TYPED_HANDLES[nodeType] : undefined;

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (node) onUpdate(node.id, 'title', e.target.value);
  }, [node, onUpdate]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (node) onUpdate(node.id, 'content', e.target.value);
  }, [node, onUpdate]);

  const handleStateColorPick = useCallback((hex: string) => {
    if (node) onUpdate(node.id, 'stateColor', hex);
  }, [node, onUpdate]);

  const handleFieldChange = useCallback((field: string, value: string) => {
    if (node) onUpdate(node.id, field, value);
  }, [node, onUpdate]);

  const handleCopyId = useCallback(() => {
    if (node) {
      navigator.clipboard.writeText(node.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    }
  }, [node]);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (node && onDelete) {
      onDelete(node.id);
      onClose();
    }
    setConfirmDelete(false);
  }, [confirmDelete, node, onDelete, onClose]);

  const showSuggestButton = !isProxy && !isState && !isContainer && nodeType !== '';

  const handleGetSuggestions = useCallback(async () => {
    if (!node) return;
    setSuggestionsLoading(true);
    setSuggestionsOpen(true);

    // Collect connected input nodes
    const inputEdges = edges.filter(e => e.target === node.id);
    const connections = inputEdges.map(e => {
      const srcNode = nodes.find(n => n.id === e.source);
      if (!srcNode) return null;
      const srcType = (srcNode.data?.type as string) || srcNode.type || '';
      return {
        type: srcType,
        title: (srcNode.data?.title as string) || '',
        content: ((srcNode.data?.content as string) || '').slice(0, 300),
      };
    }).filter(Boolean) as Array<{ type: string; title: string; content: string }>;

    // Collect connected proxy nodes
    const proxyConns = inputEdges.map(e => {
      const srcNode = nodes.find(n => n.id === e.source);
      if (!srcNode || !srcNode.data?.isProxy) return null;
      const srcType = (srcNode.data?.type as string) || srcNode.type || '';
      const elements = (srcNode.data?.selectedElements as Array<{ label: string }>) || [];
      return {
        type: srcType,
        elements: elements.map(el => el.label),
      };
    }).filter(Boolean) as Array<{ type: string; elements: string[] }>;

    // Check for connected aiNode in the graph
    let aiNodeConfig: { model: string; apiKey: string; systemPrompt?: string; temperature?: number } | undefined;
    // Look for any aiNode connected to this node (directly or anywhere in the graph)
    const aiNodeInGraph = nodes.find(n => (n.data?.type as string) === 'aiNode' && (n.data?.apiKey as string));
    if (aiNodeInGraph) {
      aiNodeConfig = {
        model: (aiNodeInGraph.data?.model as string) || 'gemini-2.0-flash',
        apiKey: (aiNodeInGraph.data?.apiKey as string) || '',
        systemPrompt: (aiNodeInGraph.data?.systemPrompt as string) || undefined,
        temperature: (aiNodeInGraph.data?.temperature as number) ?? 0.7,
      };
    }

    try {
      const res = await fetch('/api/v1/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeType: (node.data?.type as string) || node.type,
          nodeTitle: (node.data?.title as string) || '',
          nodeContent: (node.data?.content as string) || '',
          connections,
          proxies: proxyConns,
          ...(aiNodeConfig ? { aiNode: aiNodeConfig } : {}),
        }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions(['Failed to get suggestions. Please try again.']);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [node, nodes, edges]);

  // Header icon
  const HeaderIcon = getIcon(config?.icon);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      {/* Panel */}
      <div
        className={`relative w-full max-w-5xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col transition-transform duration-200 ${isOpen ? 'scale-100' : 'scale-95'}`}
        style={{ height: '85vh' }}
      >
        {node && (
          <>
            {/* === Header bar (full width) === */}
            <div className="px-5 py-3 border-b border-gray-200 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-lg text-white flex items-center justify-center"
                  style={{ backgroundColor: color }}
                >
                  {HeaderIcon ? <HeaderIcon size={20} strokeWidth={2} className="text-white" /> : (
                    <span className="text-sm font-bold">{config?.abbr || '??'}</span>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-500">{label}</span>
                <span className="text-[10px] text-gray-400 font-mono ml-2">{node.id}</span>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* === 3-column body === */}
            <div className="flex-1 flex overflow-hidden">

              {/* LEFT COLUMN — INPUTS */}
              <div className="w-[200px] border-r border-gray-200 overflow-y-auto p-4 shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">Inputs</div>
                {incomingConnections.length === 0 ? (
                  <p className="text-xs text-gray-300 italic">No inputs yet</p>
                ) : typedHandles ? (
                  // Grouped by handle for typed-handle nodes
                  typedHandles.map(h => {
                    const conns = incomingConnections.filter(c => c.handleId === h.id);
                    return (
                      <div key={h.id} className="mb-3">
                        <div className="text-[9px] uppercase tracking-wider font-semibold mb-1" style={{ color: h.color }}>
                          {h.label}
                        </div>
                        {conns.length === 0 ? (
                          <p className="text-[10px] text-gray-300 italic ml-1">--</p>
                        ) : conns.map(c => (
                          <div key={c.id} className="flex items-center gap-1.5 py-1 pl-1" style={{ borderLeft: `3px solid ${c.color}` }}>
                            <MiniIconBadge color={c.color} type={c.type} />
                            <span className="text-[11px] text-gray-700 truncate">{c.title}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })
                ) : (
                  // Flat list for regular nodes
                  incomingConnections.map(c => (
                    <div key={c.id} className="flex items-center gap-1.5 py-1.5 pl-1" style={{ borderLeft: `3px solid ${c.color}` }}>
                      <MiniIconBadge color={c.color} type={c.type} />
                      <span className="text-[11px] text-gray-700 truncate">{c.title}</span>
                    </div>
                  ))
                )}
              </div>

              {/* CENTER COLUMN — CONTENT */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                {/* Editable title */}
                {!isState && (
                  <input
                    value={isReference ? (externalTitle || title) : title}
                    onChange={handleTitleChange}
                    placeholder="Untitled"
                    className="w-full text-lg font-semibold text-gray-900 placeholder-gray-300 bg-transparent focus:outline-none border-b border-transparent focus:border-gray-300 transition-colors pb-1"
                  />
                )}

                {/* Type hint */}
                {!isState && !isContainer && (
                  <span className="text-[10px] text-gray-400">{CONTENT_HINTS[nodeType] || 'Add content...'}</span>
                )}

                {/* Content textarea for regular nodes */}
                {!isState && !isProxy && !isContainer && !isReference && (
                  <textarea
                    value={content}
                    onChange={handleContentChange}
                    placeholder="Start writing..."
                    className="flex-1 w-full bg-gray-50 text-gray-800 text-sm rounded-lg px-4 py-3 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-gray-200 leading-relaxed"
                    style={{ minHeight: 200, resize: 'none' }}
                  />
                )}

                {/* Get Suggestions button */}
                {showSuggestButton && (
                  <div>
                    <button
                      onClick={handleGetSuggestions}
                      disabled={suggestionsLoading}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 rounded-lg transition-colors"
                    >
                      {suggestionsLoading ? 'Getting suggestions...' : 'Get Suggestions \u2728'}
                    </button>

                    {suggestionsOpen && suggestions.length > 0 && (
                      <div className="mt-2 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                        <button
                          onClick={() => setSuggestionsOpen(!suggestionsOpen)}
                          className="w-full px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 text-left flex items-center justify-between"
                        >
                          <span>Suggestions ({suggestions.length})</span>
                          <span>{suggestionsOpen ? '\u25B2' : '\u25BC'}</span>
                        </button>
                        <div className="px-3 pb-3 space-y-2">
                          {suggestions.map((s, i) => (
                            <div key={i} className="text-sm text-gray-700 bg-white rounded px-3 py-2 border border-gray-100">
                              <p>{s}</p>
                              <button
                                onClick={() => {
                                  if (node) {
                                    const current = (node.data?.content as string) || '';
                                    onUpdate(node.id, 'content', current + (current ? '\n\n' : '') + s);
                                  }
                                }}
                                className="mt-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                              >Apply to content</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Node settings */}
                {nodeType === 'aiNode' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block font-medium">Model</label>
                      <select
                        value={(d?.model as string) || AI_NODE_CONFIG.defaultModel}
                        onChange={(e) => handleFieldChange('model', e.target.value)}
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      >
                        {(['Anthropic', 'OpenAI', 'Google'] as const).map(provider => (
                          <optgroup key={provider} label={provider}>
                            {AI_NODE_CONFIG.availableModels
                              .filter(m => m.provider === provider)
                              .map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">API Key (BYOT)</label>
                      <input
                        type="password"
                        value={(d?.apiKey as string) || ''}
                        onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                        placeholder="Enter your API key..."
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 border border-gray-200"
                      />
                      {(() => {
                        const selectedModel = (d?.model as string) || AI_NODE_CONFIG.defaultModel;
                        const modelInfo = AI_NODE_CONFIG.availableModels.find(m => m.id === selectedModel);
                        const providerUrl = modelInfo ? AI_NODE_CONFIG.providerUrls[modelInfo.provider] : null;
                        return providerUrl ? (
                          <a
                            href={providerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-indigo-500 hover:text-indigo-700 mt-1 inline-block"
                          >Get API key &rarr;</a>
                        ) : null;
                      })()}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">System Prompt</label>
                      <textarea
                        value={(d?.systemPrompt as string) || ''}
                        onChange={(e) => handleFieldChange('systemPrompt', e.target.value)}
                        placeholder="Custom system prompt (optional)"
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2.5 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 border border-gray-200 resize-y"
                        style={{ minHeight: 60 }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">
                        Temperature: {((d?.temperature as number) ?? 0.7).toFixed(1)}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={(d?.temperature as number) ?? 0.7}
                        onChange={(e) => {
                          if (node) onUpdate(node.id, 'temperature', parseFloat(e.target.value));
                        }}
                        className="w-full accent-indigo-500"
                      />
                      <div className="flex justify-between text-[9px] text-gray-400">
                        <span>Precise (0.0)</span>
                        <span>Creative (1.0)</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Instructions</label>
                      <textarea
                        value={(d?.instructions as string) || ''}
                        onChange={(e) => handleFieldChange('instructions', e.target.value)}
                        placeholder="What should this AI agent do?"
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2.5 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 border border-gray-200 resize-y"
                        style={{ minHeight: 80 }}
                      />
                    </div>
                  </div>
                )}

                {/* Motivation node specific fields */}
                {nodeType === 'motivation' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Trigger</label>
                      <input
                        value={(d?.trigger as string) || ''}
                        onChange={(e) => handleFieldChange('trigger', e.target.value)}
                        placeholder="What event activated this state?"
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 border border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Root Cause</label>
                      <textarea
                        value={(d?.rootCause as string) || ''}
                        onChange={(e) => handleFieldChange('rootCause', e.target.value)}
                        placeholder="What deeper wound or belief?"
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2.5 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 border border-gray-200 resize-y"
                        style={{ minHeight: 80 }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Duration</label>
                      <div className="flex gap-2">
                        {['Temporary', 'Evolving', 'Permanent'].map(opt => (
                          <button
                            key={opt}
                            onClick={() => handleFieldChange('duration', opt)}
                            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                              (d?.duration as string) === opt
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Resolution</label>
                      <textarea
                        value={(d?.resolution as string) || ''}
                        onChange={(e) => handleFieldChange('resolution', e.target.value)}
                        placeholder="What would shift this state?"
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2.5 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 border border-gray-200 resize-y"
                        style={{ minHeight: 80 }}
                      />
                    </div>
                  </div>
                )}

                {/* Reference node fields */}
                {isReference && (
                  <div className="space-y-3 flex-1">
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Content / Notes</label>
                      <textarea
                        value={content}
                        onChange={handleContentChange}
                        placeholder="Notes about this reference..."
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2.5 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-gray-200 resize-y"
                        style={{ minHeight: 120 }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">External Title</label>
                      <input
                        value={externalTitle}
                        onChange={(e) => handleFieldChange('externalTitle', e.target.value)}
                        placeholder="Title of the referenced work..."
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">External URL</label>
                      <input
                        value={externalUrl}
                        onChange={(e) => handleFieldChange('externalUrl', e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Source</label>
                      <input
                        value={source}
                        onChange={(e) => handleFieldChange('source', e.target.value)}
                        placeholder="e.g. Spotify, Wikipedia..."
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Thumbnail URL</label>
                      <input
                        value={thumbnail}
                        onChange={(e) => handleFieldChange('thumbnail', e.target.value)}
                        placeholder="https://image-url..."
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-gray-200"
                      />
                      {thumbnail && (
                        <img src={thumbnail} alt="" className="w-full rounded-lg mt-2" style={{ maxHeight: 160, objectFit: 'cover' }} />
                      )}
                    </div>
                  </div>
                )}

                {/* State node color picker */}
                {isState && (
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block font-medium">Emotional State</label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(STATE_COLORS).map(([key, { hex, label: colorLabel }]) => (
                        <button
                          key={key}
                          onClick={() => handleStateColorPick(hex)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                          style={{ border: stateColor === hex ? `2px solid ${hex}` : '1px solid #e5e7eb' }}
                        >
                          <span style={{ width: 16, height: 16, borderRadius: '50%', background: hex, display: 'inline-block', flexShrink: 0 }} />
                          <span className="text-[11px] text-gray-600">{colorLabel}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proxy node -- multi-select elements from cloud */}
                {isProxy && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Source Cloud</label>
                      <input
                        value={(d?.sourceCloudId as string) || ''}
                        onChange={(e) => handleFieldChange('sourceCloudId', e.target.value)}
                        placeholder="Cloud ID or name to pull from..."
                        className="w-full bg-gray-50 text-gray-700 text-sm rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-gray-200"
                      />
                      {(d?.sourceCloudName as string) && (
                        <span className="text-[10px] text-gray-400 mt-0.5 block">Cloud: {d.sourceCloudName as string}</span>
                      )}
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block font-medium">Selected Elements</label>
                      {(() => {
                        const elements = (d?.selectedElements as Array<{ id: string; label: string; note: string }>) || [];
                        return (
                          <>
                            {elements.length === 0 ? (
                              <p className="text-xs text-gray-300 italic mb-2">No elements selected</p>
                            ) : (
                              <div className="space-y-1.5 mb-2">
                                {elements.map((el, idx) => (
                                  <div key={el.id || idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-800 font-medium shrink-0">{el.label}</span>
                                    <input
                                      value={el.note || ''}
                                      onChange={(e) => {
                                        const updated = [...elements];
                                        updated[idx] = { ...el, note: e.target.value };
                                        if (node) onUpdate(node.id, 'selectedElements', updated);
                                      }}
                                      placeholder="Add note..."
                                      className="flex-1 text-xs text-gray-500 bg-transparent border-b border-gray-200 focus:border-blue-400 focus:outline-none px-1 py-0.5"
                                    />
                                    <button
                                      onClick={() => {
                                        const updated = elements.filter((_, i) => i !== idx);
                                        if (node) onUpdate(node.id, 'selectedElements', updated);
                                      }}
                                      className="text-red-400 hover:text-red-600 text-xs font-bold shrink-0"
                                      title="Remove"
                                    >&times;</button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {addingElement ? (
                              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 space-y-2">
                                <input
                                  value={newElementLabel}
                                  onChange={(e) => setNewElementLabel(e.target.value)}
                                  placeholder="Element label..."
                                  className="w-full text-sm bg-white rounded px-2 py-1.5 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                  autoFocus
                                />
                                <input
                                  value={newElementNote}
                                  onChange={(e) => setNewElementNote(e.target.value)}
                                  placeholder="Optional note..."
                                  className="w-full text-xs bg-white rounded px-2 py-1 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      if (newElementLabel.trim() && node) {
                                        const updated = [...elements, {
                                          id: `el_${Date.now()}`,
                                          label: newElementLabel.trim(),
                                          note: newElementNote.trim(),
                                        }];
                                        onUpdate(node.id, 'selectedElements', updated);
                                        setNewElementLabel('');
                                        setNewElementNote('');
                                        setAddingElement(false);
                                      }
                                    }}
                                    className="px-3 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                  >Add</button>
                                  <button
                                    onClick={() => { setAddingElement(false); setNewElementLabel(''); setNewElementNote(''); }}
                                    className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                                  >Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddingElement(true)}
                                className="w-full py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                              >+ Add element</button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Container node info */}
                {isContainer && (
                  <div className="text-sm text-gray-500">
                    <p>This is a container node (subcloud). Click &quot;Open &rarr;&quot; on the node card to navigate inside.</p>
                    {config?.childNodeTypes && (
                      <div className="mt-3">
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium">Allowed child types</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {config.childNodeTypes.map(ct => {
                            const childConf = NODE_TYPE_MAP[ct];
                            return (
                              <span key={ct} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full border border-gray-200">
                                {childConf?.emoji} {childConf?.label || ct}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Settings (bottom of center column) */}
                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-medium">Node color</span>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleFieldChange('color', e.target.value)}
                      className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
                    />
                  </div>
                  <button
                    onClick={handleCopyId}
                    className="w-full py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                  >
                    {copiedId ? 'Copied!' : 'Copy node ID'}
                  </button>
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      onMouseLeave={() => setConfirmDelete(false)}
                      className={`w-full py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        confirmDelete
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                      }`}
                    >
                      {confirmDelete ? 'Click again to confirm' : 'Delete node'}
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN — OUTPUTS */}
              <div className="w-[200px] border-l border-gray-200 overflow-y-auto p-4 shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">Outputs</div>
                {outgoingConnections.length === 0 ? (
                  <p className="text-xs text-gray-300 italic">No outputs yet</p>
                ) : (
                  outgoingConnections.map(c => (
                    <div key={c.id} className="flex items-center gap-1.5 py-1.5 pr-1" style={{ borderRight: `3px solid ${c.color}` }}>
                      <MiniIconBadge color={c.color} type={c.type} />
                      <span className="text-[11px] text-gray-700 truncate">{c.title}</span>
                    </div>
                  ))
                )}
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
