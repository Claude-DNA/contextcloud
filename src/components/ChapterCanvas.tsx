'use client';

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ReactFlow,
  ConnectionMode,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import GraphNodeComponent from '@/components/graph/GraphNode';
import { NODE_TYPES, NODE_TYPE_MAP, STATE_COLORS, type NodeTypeConfig } from '@/components/graph/nodeTypes';
import { GraphContext } from '@/components/graph/GraphContext';
import NodePanel from '@/components/graph/NodePanel';

const nodeTypes: Record<string, typeof GraphNodeComponent> = {};
for (const nt of NODE_TYPES) {
  nodeTypes[nt.type] = GraphNodeComponent;
}

// Proxy + meta + reference node categories for the chapter sidebar
const CHAPTER_SIDEBAR_CATEGORIES = ['proxy', 'meta', 'reference', 'container'];

interface ChapterInfo {
  id: string;
  name: string;
  arc_name?: string;
  arc_id?: string;
}

interface PlotRow {
  id: string;
  name?: string;
  title?: string;
  content?: string;
  predictability?: number;
  sort_order?: number;
}

export default function ChapterCanvas({ chapterId }: { chapterId: string }) {
  const { data: session } = useSession();
  const reactFlowInstance = useReactFlow();

  const [chapterInfo, setChapterInfo] = useState<ChapterInfo | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const nodeCounter = useRef(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // --- Callbacks passed into node data ---
  const handleTitleChange = useCallback((nodeId: string, newTitle: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, title: newTitle } } : n));
  }, [setNodes]);

  const handleContentChange = useCallback((nodeId: string, newContent: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, content: newContent } } : n));
  }, [setNodes]);

  const handleStateColorChange = useCallback((nodeId: string, color: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, stateColor: color } } : n));
  }, [setNodes]);

  const handleImageGenerated = useCallback((nodeId: string, url: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, generatedImage: url } } : n));
  }, [setNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [setNodes, setEdges, selectedNodeId]);

  const handlePanelUpdate = useCallback((nodeId: string, field: string, value: unknown) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, [field]: value } } : n));
  }, [setNodes]);

  const onZoomToParent = useCallback((parentNodeId: string) => {
    const node = reactFlowInstance.getNodes().find((n: Node) => n.id === parentNodeId);
    if (!node) return;
    reactFlowInstance.fitView({ nodes: [node], duration: 500, padding: 0.3 });
  }, [reactFlowInstance]);

  // Build node data with all callbacks
  const makeNodeData = useCallback((type: string, extra: Record<string, unknown> = {}) => ({
    type,
    label: NODE_TYPE_MAP[type]?.label || type,
    emoji: NODE_TYPE_MAP[type]?.emoji || '',
    color: NODE_TYPE_MAP[type]?.color || '#6b7280',
    title: '',
    content: '',
    isProxy: NODE_TYPE_MAP[type]?.isProxy || false,
    isContainer: NODE_TYPE_MAP[type]?.isContainer || false,
    stateColor: null,
    parentNodeId: '',
    parentLabel: '',
    graphId: draftId,
    onTitleChange: handleTitleChange,
    onContentChange: handleContentChange,
    onZoomToParent,
    onStateColorChange: handleStateColorChange,
    onImageGenerated: handleImageGenerated,
    onDelete: handleDeleteNode,
    ...extra,
  }), [draftId, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode]);

  // Build plots as initial nodes — each plot gets its proxy cloud nodes pre-connected
  const buildPlotNodes = useCallback((plots: PlotRow[]) => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const COL_WIDTH = 560; // horizontal gap between plot columns
    const PLOT_Y = 260;    // plot node vertical center

    plots.forEach((plot, i) => {
      const plotId = `plot_${plot.id}`;
      const cx = 240 + i * COL_WIDTH; // plot center x

      // --- Plot node ---
      newNodes.push({
        id: plotId,
        type: 'plot',
        position: { x: cx, y: PLOT_Y },
        dragging: false, selected: false,
        data: makeNodeData('plot', { title: plot.name || plot.title || `Plot ${i + 1}`, content: plot.content || '' }),
      });

      // --- Proxy clouds (left side) ---
      const proxies: Array<{ type: string; handle: string; dx: number; dy: number }> = [
        { type: 'ideasProxy',      handle: 'ideas',      dx: -240, dy:  80 },
        { type: 'worldProxy',      handle: 'world',      dx: -240, dy: -20 },
        { type: 'aiNode',          handle: 'ai',         dx: -240, dy: -120 },
        { type: 'referencesProxy', handle: 'references', dx: -240, dy:  180 },
      ];

      proxies.forEach(({ type, handle, dx, dy }) => {
        const proxyId = `${type}_${plot.id}`;
        newNodes.push({
          id: proxyId,
          type,
          position: { x: cx + dx, y: PLOT_Y + dy },
          dragging: false, selected: false,
          data: makeNodeData(type, { title: '', content: '' }),
        });
        newEdges.push({
          id: `e_${proxyId}_${plotId}`,
          source: proxyId,
          target: plotId,
          targetHandle: handle,
          animated: false,
          style: { stroke: '#c4c8d0' },
        });
      });

      // --- Prev-plot chain edge ---
      if (i > 0) {
        newEdges.push({
          id: `e_plot_chain_${i}`,
          source: `plot_${plots[i - 1].id}`,
          target: plotId,
          sourceHandle: 'output',
          targetHandle: 'prev_plot',
          animated: true,
          style: { stroke: '#4A90D9', strokeDasharray: '5 5' },
        });
      }
    });

    return { newNodes, newEdges };
  }, [makeNodeData]);

  // Reload callbacks in existing nodes when makeNodeData changes
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        graphId: draftId,
        onTitleChange: handleTitleChange,
        onContentChange: handleContentChange,
        onZoomToParent,
        onStateColorChange: handleStateColorChange,
        onImageGenerated: handleImageGenerated,
        onDelete: handleDeleteNode,
      },
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Load chapter data + saved canvas (or build fresh from plots)
  useEffect(() => {
    if (!chapterId || !session) return;

    const load = async () => {
      try {
        // Fetch chapter info + plots
        const chapRes = await fetch(`/api/v1/chapter-plots/${chapterId}`);
        const chapData = await chapRes.json();
        if (!chapData.chapter) return;
        setChapterInfo(chapData.chapter as ChapterInfo);

        // Try to load saved canvas for this chapter
        const draftsRes = await fetch('/api/v1/drafts');
        const draftsData = await draftsRes.json();
        const saved = (draftsData.drafts || []).find(
          (d: { title?: string; type?: string }) => d.title === `chapter:${chapterId}` && d.type === 'graph'
        );

        if (saved) {
          const dRes = await fetch(`/api/v1/drafts/${saved.id}`);
          const dData = await dRes.json();
          const content = typeof dData.draft.content === 'string'
            ? JSON.parse(dData.draft.content)
            : dData.draft.content;

          // Rehydrate callbacks
          const rehydrated: Node[] = (content.nodes || []).map((n: Node) => ({
            ...n,
            data: { ...n.data, ...makeNodeData(n.data?.type as string || n.type || 'plot', n.data as Record<string, unknown>) },
          }));
          setNodes(rehydrated);
          setEdges(content.edges || []);
          setDraftId(saved.id);
        } else {
          // Build from plots
          const { newNodes, newEdges } = buildPlotNodes(chapData.plots || []);
          setNodes(newNodes);
          setEdges(newEdges);
        }
        setInitialized(true);
        setTimeout(() => reactFlowInstance.fitView({ duration: 500, padding: 0.1 }), 300);
      } catch (err) {
        console.error('Failed to load chapter canvas:', err);
        setInitialized(true);
      }
    };

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, session]);

  // Add node
  const addNode = useCallback((config: NodeTypeConfig) => {
    nodeCounter.current += 1;
    const id = `node_${nodeCounter.current}_${Date.now()}`;
    const newNode: Node = {
      id,
      type: config.type,
      position: { x: 100 + Math.random() * 400, y: 80 + Math.random() * 200 },
      dragging: false,
      selected: false,
      data: makeNodeData(config.type),
    };
    setNodes(nds => [...nds, newNode]);
  }, [setNodes, makeNodeData]);

  // Save
  const cleanNodesForSave = useCallback((nodesToClean: Node[]) => {
    return nodesToClean.map(n => {
      const clean: Record<string, unknown> = {
        type: n.data.type, label: n.data.label, emoji: n.data.emoji,
        color: n.data.color, title: n.data.title, content: n.data.content,
      };
      if (n.data.isProxy) clean.isProxy = true;
      if (n.data.stateColor) clean.stateColor = n.data.stateColor;
      if (n.data.parentNodeId) clean.parentNodeId = n.data.parentNodeId;
      if (n.data.parentLabel) clean.parentLabel = n.data.parentLabel;
      return { ...n, data: clean };
    });
  }, []);

  const save = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    try {
      const cleanNodes = cleanNodesForSave(nodes);
      const method = draftId ? 'PUT' : 'POST';
      const body = {
        ...(draftId ? { id: draftId } : {}),
        title: `chapter:${chapterId}`,
        type: 'graph',
        status: 'draft',
        content: JSON.stringify({ nodes: cleanNodes, edges }),
      };
      const res = await fetch('/api/v1/drafts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.draft?.id) setDraftId(data.draft.id);
      showToast('Saved');
    } catch {
      showToast('Save failed');
    }
    setSaving(false);
  }, [session, nodes, edges, draftId, chapterId, cleanNodesForSave, showToast]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, animated: true, style: { stroke: '#c4c8d0', strokeDasharray: '5 5' } }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const bigNodes = useMemo(() =>
    nodes.filter(n => n.type === 'character' || n.type === 'scene')
      .map(n => ({ id: n.id, label: (n.data.title as string) || n.type || 'unnamed' })),
    [nodes]);

  const categorized = useMemo(() => ({
    proxy: NODE_TYPES.filter(n => n.isProxy),
    meta: NODE_TYPES.filter(n => n.category === 'meta'),
    reference: NODE_TYPES.filter(n => n.category === 'reference'),
    content: NODE_TYPES.filter(n => ['character', 'world', 'scene', 'dialogue'].includes(n.type)),
  }), []);

  if (!session) return (
    <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-gray-500">
      Please sign in.
    </div>
  );

  if (!initialized) return (
    <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-gray-400">
      Loading chapter...
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <div
        className="w-52 bg-white border-r border-gray-200 overflow-y-auto shrink-0"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="p-3">
          {/* Back */}
          <Link
            href="/workspace/visual"
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 mb-3 font-medium"
          >
            ← Back to Canvas
          </Link>

          {/* Chapter name */}
          <div className="mb-3 px-2 py-2 rounded-lg bg-indigo-50 border border-indigo-100">
            <div className="text-[9px] uppercase tracking-wider text-indigo-400 font-medium mb-0.5">
              {chapterInfo?.arc_name || 'Arc'}
            </div>
            <div className="text-xs font-semibold text-indigo-800 truncate">
              {chapterInfo?.name || 'Chapter'}
            </div>
          </div>

          <div className="text-xs uppercase tracking-wider text-gray-400 mb-3 font-medium">Add Node</div>

          {/* Proxy nodes */}
          {categorized.proxy.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-yellow-600 font-medium mb-1.5">Cloud Proxies</div>
              <div className="space-y-0.5">
                {categorized.proxy.map(nt => (
                  <button key={nt.type} onClick={() => addNode(nt)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-yellow-50 transition-colors flex items-center gap-2 text-gray-700">
                    <span>{nt.emoji}</span><span>{nt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content nodes */}
          {categorized.content.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-blue-600 font-medium mb-1.5">Content</div>
              <div className="space-y-0.5">
                {categorized.content.map(nt => (
                  <button key={nt.type} onClick={() => addNode(nt)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-blue-50 transition-colors flex items-center gap-2 text-gray-700">
                    <span>{nt.emoji}</span><span>{nt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reference nodes */}
          {categorized.reference.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-amber-600 font-medium mb-1.5">Reference</div>
              <div className="space-y-0.5">
                {categorized.reference.map(nt => (
                  <button key={nt.type} onClick={() => addNode(nt)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-amber-50 transition-colors flex items-center gap-2 text-gray-700">
                    <span>{nt.emoji}</span><span>{nt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Meta nodes */}
          {categorized.meta.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-purple-600 font-medium mb-1.5">Meta</div>
              <div className="space-y-0.5">
                {categorized.meta.map(nt => (
                  <button key={nt.type} onClick={() => addNode(nt)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-purple-50 transition-colors flex items-center gap-2 text-gray-700">
                    <span>{nt.emoji}</span><span>{nt.label}</span>
                    {nt.type === 'state' && (
                      <span className="flex gap-0.5 ml-auto">
                        {Object.values(STATE_COLORS).map(({ hex }, i) => (
                          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: hex, display: 'inline-block' }} />
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <GraphContext.Provider value={{ bigNodes, onParentChange: (nodeId, parentNodeId, parentLabel) => {
          setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, parentNodeId, parentLabel } } : n));
        }}}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={(c) => c.source !== c.target}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            className="bg-[#f5f5fa]"
          >
            <Controls position="bottom-left" className="!bg-white !border-gray-200 !shadow-sm" />
            <MiniMap position="bottom-right" nodeColor={(n) => NODE_TYPE_MAP[n.type || '']?.color || '#6b7280'} maskColor="rgba(255,255,255,0.7)" className="!bg-white !border-gray-200" />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />

            {/* Top toolbar */}
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium px-1">
                  📑 {chapterInfo?.name || 'Chapter'}
                </span>
                <div className="w-px h-5 bg-gray-200" />
                <button
                  onClick={async () => {
                    // Re-fetch plots and rebuild scaffold from scratch
                    try {
                      const res = await fetch(`/api/v1/chapter-plots/${chapterId}`);
                      const data = await res.json();
                      const { newNodes, newEdges } = buildPlotNodes(data.plots || []);
                      setNodes(newNodes);
                      setEdges(newEdges);
                      setDraftId(null); // clear saved draft reference
                      showToast('Reloaded from Arc Cloud');
                      setTimeout(() => reactFlowInstance.fitView({ duration: 500, padding: 0.1 }), 200);
                    } catch { showToast('Reload failed'); }
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  ↺ Reload
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </ReactFlow>
        </GraphContext.Provider>
      </div>

      {/* Node panel */}
      <NodePanel
        node={nodes.find(n => n.id === selectedNodeId) || null}
        nodes={nodes}
        edges={edges}
        onClose={() => setSelectedNodeId(null)}
        onUpdate={handlePanelUpdate}
        onDelete={handleDeleteNode}
      />

      {toast && (
        <div className="fixed top-20 right-4 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-md text-sm z-50 text-gray-800">
          {toast}
        </div>
      )}
    </div>
  );
}
