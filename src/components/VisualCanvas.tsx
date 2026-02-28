'use client';

import { useCallback, useState, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import {
  ReactFlow,
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
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import GraphNodeComponent from '@/components/graph/GraphNode';
import { NODE_TYPES, NODE_TYPE_MAP, STATE_COLORS, type NodeTypeConfig } from '@/components/graph/nodeTypes';
import { GraphContext } from '@/components/graph/GraphContext';
import NodePanel from '@/components/graph/NodePanel';

// Register all node types to the same GraphNode component
const nodeTypes: Record<string, typeof GraphNodeComponent> = {};
for (const nt of NODE_TYPES) {
  nodeTypes[nt.type] = GraphNodeComponent;
}

// --- Cloud navigation types ---
interface CloudLevel {
  id: string;       // node id of the container (or 'root')
  title: string;
  type: string;
  nodes: Node[];
  edges: Edge[];
  draftId: string | null;
}

function serializeGraphForAI(title: string, nodes: Node[], edges: Edge[]): string {
  const sections: Record<string, string[]> = {
    content: [],
    reference: [],
    meta: [],
  };

  for (const node of nodes) {
    const config = NODE_TYPE_MAP[node.type || ''];
    if (!config) continue;
    const nodeTitle = (node.data?.title as string) || '';
    const nodeContent = (node.data?.content as string) || '';
    const line = config.category === 'reference'
      ? `${config.emoji} ${config.label.toUpperCase()}: ${nodeTitle}${nodeContent ? ' \u2014 ' + nodeContent : ''}`
      : config.category === 'meta'
        ? `${config.emoji} ${config.label.toUpperCase()}: ${nodeContent || nodeTitle}`
        : `${config.emoji} ${config.label.toUpperCase()}: ${nodeTitle}\n${nodeContent}`;
    sections[config.category].push(line);
  }

  const edgeLines = edges.map(e => {
    const src = nodes.find(n => n.id === e.source);
    const tgt = nodes.find(n => n.id === e.target);
    return `  ${(src?.data?.title as string) || src?.type || '?'} -> ${(tgt?.data?.title as string) || tgt?.type || '?'}`;
  });

  let out = `=== CONTEXT GRAPH: ${title} ===\n\n`;
  if (sections.content.length > 0) {
    out += `[CONTENT NODES]\n${sections.content.join('\n\n')}\n\n`;
  }
  if (sections.reference.length > 0) {
    out += `[REFERENCE NODES]\n${sections.reference.join('\n')}\n\n`;
  }
  if (sections.meta.length > 0) {
    out += `[META]\n${sections.meta.join('\n')}\n\n`;
  }
  if (edgeLines.length > 0) {
    out += `[CONNECTIONS]\n${edgeLines.join('\n')}\n\n`;
  }
  out += `=== END GRAPH ===`;
  return out;
}

export default function VisualCanvas() {
  const { data: session } = useSession();
  const reactFlowInstance = useReactFlow();

  const [title, setTitle] = useState('Untitled Graph');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [importing, setImporting] = useState(false);
  const nodeCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Cloud navigation state ---
  const [cloudStack, setCloudStack] = useState<CloudLevel[]>([]);
  // cloudStack = [] means we're at root. cloudStack[last] = parent of current view.

  // Show toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // Image generated handler
  const handleImageGenerated = useCallback((nodeId: string, url: string) => {
    setNodes(nds =>
      nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, generatedImage: url } } : n)
    );
  }, [setNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [setNodes, setEdges, selectedNodeId]);

  // Node data change handlers
  const handleTitleChange = useCallback((nodeId: string, newTitle: string) => {
    setNodes(nds =>
      nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, title: newTitle } } : n)
    );
  }, [setNodes]);

  const handleContentChange = useCallback((nodeId: string, newContent: string) => {
    setNodes(nds =>
      nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, content: newContent } } : n)
    );
  }, [setNodes]);

  // Zoom to parent node (for proxy nodes)
  const onZoomToParent = useCallback((parentNodeId: string) => {
    const node = reactFlowInstance.getNodes().find((n: Node) => n.id === parentNodeId);
    if (!node) return;
    reactFlowInstance.fitView({ nodes: [node], duration: 500, padding: 0.3 });
  }, [reactFlowInstance]);

  // State color change handler
  const handleStateColorChange = useCallback((nodeId: string, color: string) => {
    setNodes(nds => {
      const updated = nds.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, stateColor: color } } : n
      );
      return updated;
    });
    setEdges(currentEdges => {
      const connectedProxyIds = currentEdges
        .filter(e => e.source === nodeId)
        .map(e => e.target);
      if (connectedProxyIds.length > 0) {
        setNodes(nds =>
          nds.map(n => {
            if (connectedProxyIds.includes(n.id) && n.data.isProxy) {
              return { ...n, data: { ...n.data, stateColor: color } };
            }
            return n;
          })
        );
      }
      return currentEdges;
    });
  }, [setNodes, setEdges]);

  // Panel update handler
  const handlePanelUpdate = useCallback((nodeId: string, field: string, value: unknown) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, [field]: value } } : n));
  }, [setNodes]);

  // --- Container open handler ---
  const handleOpenContainer = useCallback((containerId: string) => {
    const containerNode = nodes.find(n => n.id === containerId);
    if (!containerNode) return;

    // Save current canvas state to stack
    setCloudStack(prev => [
      ...prev,
      {
        id: containerId,
        title: (containerNode.data.title as string) || (containerNode.data.label as string) || 'Container',
        type: containerNode.type || '',
        nodes: [...nodes],
        edges: [...edges],
        draftId,
      },
    ]);

    // Load child canvas or create empty one
    const childCanvas = containerNode.data.childCanvas as { nodes?: Node[]; edges?: Edge[] } | undefined;
    if (childCanvas?.nodes && childCanvas.nodes.length > 0) {
      // Restore child nodes with callbacks
      const restored = childCanvas.nodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          onTitleChange: handleTitleChange,
          onContentChange: handleContentChange,
          onZoomToParent,
          onStateColorChange: handleStateColorChange,
          onImageGenerated: handleImageGenerated,
          onDelete: handleDeleteNode,
          onOpenContainer: handleOpenContainer,
        },
      }));
      setNodes(restored);
      setEdges(childCanvas.edges || []);
    } else {
      setNodes([]);
      setEdges([]);
    }
    setSelectedNodeId(null);
    setTimeout(() => reactFlowInstance.fitView({ duration: 300 }), 100);
  }, [nodes, edges, draftId, setNodes, setEdges, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, reactFlowInstance]);

  // --- Navigate back to a breadcrumb level ---
  const handleNavigateBack = useCallback((levelIndex: number) => {
    if (cloudStack.length === 0) return;

    // Save current nodes/edges into the container node at the top of stack
    const currentLevel = cloudStack[cloudStack.length - 1];
    // We need to save current canvas into the container node of the parent level
    const cleanChildNodes = nodes.map(n => {
      const clean: Record<string, unknown> = { ...n.data };
      // Strip callbacks
      delete clean.onTitleChange;
      delete clean.onContentChange;
      delete clean.onZoomToParent;
      delete clean.onStateColorChange;
      delete clean.onImageGenerated;
      delete clean.onDelete;
      delete clean.onOpenContainer;
      return { ...n, data: clean };
    });

    // Navigate back: restore the target level
    let targetNodes: Node[];
    let targetEdges: Edge[];

    if (levelIndex < 0) {
      // Go to root
      if (cloudStack.length > 0) {
        const rootLevel = cloudStack[0];
        targetNodes = rootLevel.nodes;
        targetEdges = rootLevel.edges;
      } else {
        return;
      }
    } else {
      // Go to the level AFTER the clicked breadcrumb (which is stored at levelIndex)
      const targetLevel = cloudStack[levelIndex];
      targetNodes = targetLevel.nodes;
      targetEdges = targetLevel.edges;
    }

    // Update the container node with current child canvas before restoring parent
    const containerNodeId = currentLevel.id;
    targetNodes = targetNodes.map(n => {
      if (n.id === containerNodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            childCanvas: { nodes: cleanChildNodes, edges },
          },
        };
      }
      return n;
    });

    // Restore callbacks on target nodes
    const restored = targetNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        onTitleChange: handleTitleChange,
        onContentChange: handleContentChange,
        onZoomToParent,
        onStateColorChange: handleStateColorChange,
        onImageGenerated: handleImageGenerated,
        onDelete: handleDeleteNode,
        onOpenContainer: handleOpenContainer,
      },
    }));

    setNodes(restored);
    setEdges(targetEdges);

    // Trim the stack
    if (levelIndex < 0) {
      setCloudStack([]);
    } else {
      setCloudStack(prev => prev.slice(0, levelIndex));
    }

    setSelectedNodeId(null);
    setTimeout(() => reactFlowInstance.fitView({ duration: 300 }), 100);
  }, [cloudStack, nodes, edges, setNodes, setEdges, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, handleOpenContainer, reactFlowInstance]);

  // Node click handlers
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  // Parent change handler for proxy nodes
  const handleParentChange = useCallback((nodeId: string, parentNodeId: string, parentLabel: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, parentNodeId, parentLabel } } : n));
  }, [setNodes]);

  // Big nodes list for proxy dropdown
  const bigNodes = useMemo(() =>
    nodes.filter(n => n.type === 'character' || n.type === 'scene')
      .map(n => ({ id: n.id, label: (n.data.title as string) || n.type || 'unnamed' })),
    [nodes]
  );

  // Determine which node types to show in sidebar
  const allowedChildTypes = useMemo(() => {
    if (cloudStack.length === 0) return null; // null = show all
    const currentContainer = cloudStack[cloudStack.length - 1];
    const containerConfig = NODE_TYPE_MAP[currentContainer.type];
    return containerConfig?.childNodeTypes || null;
  }, [cloudStack]);

  // Add node
  const addNode = useCallback((config: NodeTypeConfig) => {
    nodeCounter.current += 1;
    const id = `node_${nodeCounter.current}_${Date.now()}`;
    const newNode: Node = {
      id,
      type: config.type,
      position: { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 },
      dragging: false,
      selected: false,
      data: {
        type: config.type,
        label: config.label,
        emoji: config.emoji,
        color: config.color,
        title: '',
        content: '',
        isProxy: config.isProxy || false,
        isContainer: config.isContainer || false,
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
        onOpenContainer: handleOpenContainer,
      },
    };
    setNodes(nds => [...nds, newNode]);
  }, [setNodes, draftId, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, handleOpenContainer]);

  // Connect edges
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds => addEdge({ ...connection, animated: true, style: { stroke: '#c4c8d0', strokeDasharray: '5 5' } }, eds));

      // State -> Proxy recolor mechanic
      setNodes(nds => {
        const sourceNode = nds.find(n => n.id === connection.source);
        const targetNode = nds.find(n => n.id === connection.target);
        if (
          sourceNode && targetNode &&
          sourceNode.data.type === 'state' &&
          targetNode.data.isProxy &&
          sourceNode.data.stateColor
        ) {
          return nds.map(n =>
            n.id === connection.target
              ? { ...n, data: { ...n.data, stateColor: sourceNode.data.stateColor } }
              : n
          );
        }
        return nds;
      });
    },
    [setEdges, setNodes]
  );

  // Validate connections
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      if (connection.source === connection.target) return false;
      return true;
    },
    []
  );

  // --- Save: serialize including childCanvas for container nodes ---
  const cleanNodesForSave = useCallback((nodesToClean: Node[]) => {
    return nodesToClean.map(n => {
      const clean: Record<string, unknown> = {
        type: n.data.type,
        label: n.data.label,
        emoji: n.data.emoji,
        color: n.data.color,
        title: n.data.title,
        content: n.data.content,
      };
      if (n.data.isProxy) clean.isProxy = true;
      if (n.data.isContainer) clean.isContainer = true;
      if (n.data.parentNodeId) clean.parentNodeId = n.data.parentNodeId;
      if (n.data.parentLabel) clean.parentLabel = n.data.parentLabel;
      if (n.data.stateColor) clean.stateColor = n.data.stateColor;
      if (n.data.generatedImage) clean.generatedImage = n.data.generatedImage;
      if (n.data.externalTitle) clean.externalTitle = n.data.externalTitle;
      if (n.data.thumbnail) clean.thumbnail = n.data.thumbnail;
      if (n.data.externalUrl) clean.externalUrl = n.data.externalUrl;
      if (n.data.source) clean.source = n.data.source;
      if (n.data.childCanvas) clean.childCanvas = n.data.childCanvas;
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
        title,
        description: '',
        type: 'graph',
        canvas: { nodes: cleanNodes, edges },
      };

      const res = await fetch('/api/v1/drafts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Save failed');
        return;
      }

      if (!draftId && data.draft?.id) {
        setDraftId(data.draft.id);
      }
      showToast('Saved!');
    } catch {
      showToast('Save failed');
    }
    setSaving(false);
  }, [session, draftId, title, nodes, edges, showToast, cleanNodesForSave]);

  // Publish
  const publish = useCallback(async () => {
    if (!session) return;
    setPublishing(true);
    try {
      await save();
      const res = await fetch('/api/v1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, title, type: 'graph' }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Publish failed');
      } else {
        showToast(`Published! ${data.published?.url || ''}`);
      }
    } catch {
      showToast('Publish failed');
    }
    setPublishing(false);
  }, [session, draftId, title, save, showToast]);

  // Copy for AI
  const copyForAI = useCallback(() => {
    const text = serializeGraphForAI(title, nodes, edges);
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!');
    });
  }, [title, nodes, edges, showToast]);

  // --- File import handler ---
  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/v1/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Import failed');
        return;
      }

      if (data.nodes && data.edges) {
        // Convert imported nodes to full nodes with callbacks
        const importedNodes: Node[] = data.nodes.map((n: { id?: string; type: string; title: string; content: string; position: { x: number; y: number } }, i: number) => {
          nodeCounter.current += 1;
          const id = n.id || `imp_${nodeCounter.current}_${Date.now()}`;
          const config = NODE_TYPE_MAP[n.type];
          return {
            id,
            type: n.type,
            position: n.position || { x: 100 + (i % 5) * 220, y: 100 + Math.floor(i / 5) * 120 },
            data: {
              type: n.type,
              label: config?.label || n.type,
              emoji: config?.emoji || '',
              color: config?.color || '#4A90D9',
              title: n.title || '',
              content: n.content || '',
              isProxy: false,
              isContainer: false,
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
              onOpenContainer: handleOpenContainer,
            },
          };
        });

        // Build edge ID map (imported IDs -> actual IDs)
        const idMap: Record<string, string> = {};
        data.nodes.forEach((n: { id?: string }, i: number) => {
          if (n.id) idMap[n.id] = importedNodes[i].id;
        });

        const importedEdges: Edge[] = (data.edges || []).map((e: { source: string; target: string }, i: number) => ({
          id: `imp_edge_${i}_${Date.now()}`,
          source: idMap[e.source] || e.source,
          target: idMap[e.target] || e.target,
          animated: true,
          style: { stroke: '#c4c8d0', strokeDasharray: '5 5' },
        }));

        setNodes(importedNodes);
        setEdges(importedEdges);
        if (data.title) setTitle(data.title);
        showToast(`Imported ${importedNodes.length} nodes from document`);
        setTimeout(() => reactFlowInstance.fitView({ duration: 500 }), 200);
      }
    } catch {
      showToast('Import failed');
    }
    setImporting(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [draftId, showToast, setNodes, setEdges, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, handleOpenContainer, reactFlowInstance]);

  // Categorized node types for sidebar (filtered by container context)
  const categorized = useMemo(() => {
    const filterFn = (n: NodeTypeConfig) => {
      if (allowedChildTypes) {
        return allowedChildTypes.includes(n.type);
      }
      return true;
    };

    return {
      content: NODE_TYPES.filter(n => n.category === 'content' && !n.isProxy && filterFn(n)),
      proxy: NODE_TYPES.filter(n => n.isProxy === true && filterFn(n)),
      reference: NODE_TYPES.filter(n => n.category === 'reference' && filterFn(n)),
      meta: NODE_TYPES.filter(n => n.category === 'meta' && filterFn(n)),
      container: NODE_TYPES.filter(n => n.category === 'container' && filterFn(n)),
    };
  }, [allowedChildTypes]);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted">
        Please sign in to use the visual editor.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Node type sidebar */}
      {sidebarOpen && (
        <div className="w-56 bg-white border-r border-gray-200 overflow-y-auto shrink-0">
          <div className="p-3">
            {/* Title input */}
            <div className="mb-3">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-gray-50 text-gray-800 text-sm font-medium rounded px-2 py-1.5 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-200"
                placeholder="Graph title..."
              />
            </div>

            <div className="text-xs uppercase tracking-wider text-gray-400 mb-3 font-medium">Add Node</div>

            {/* Container Nodes */}
            {categorized.container.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-indigo-600 font-medium mb-2">Subclouds</div>
                <div className="space-y-0.5">
                  {categorized.container.map(nt => (
                    <button
                      key={nt.type}
                      onClick={() => addNode(nt)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700"
                    >
                      <span>{nt.emoji}</span>
                      <span>{nt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Content Nodes */}
            {categorized.content.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-blue-600 font-medium mb-2">Content</div>
                <div className="space-y-0.5">
                  {categorized.content.map(nt => (
                    <button
                      key={nt.type}
                      onClick={() => addNode(nt)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700"
                    >
                      <span>{nt.emoji}</span>
                      <span>{nt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Proxy Nodes */}
            {categorized.proxy.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-purple-600 font-medium mb-2">Proxy</div>
                <div className="space-y-0.5">
                  {categorized.proxy.map(nt => (
                    <button
                      key={nt.type}
                      onClick={() => addNode(nt)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-600"
                    >
                      <span>{nt.emoji}</span>
                      <span>{nt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reference Nodes */}
            {categorized.reference.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-amber-600 font-medium mb-2">Reference</div>
                <div className="space-y-0.5">
                  {categorized.reference.map(nt => (
                    <button
                      key={nt.type}
                      onClick={() => addNode(nt)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700"
                    >
                      <span>{nt.emoji}</span>
                      <span>{nt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Meta Nodes */}
            {categorized.meta.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-purple-600 font-medium mb-2">Meta</div>
                <div className="space-y-0.5">
                  {categorized.meta.map(nt => (
                    <button
                      key={nt.type}
                      onClick={() => addNode(nt)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700"
                    >
                      <span>{nt.emoji}</span>
                      <span>{nt.label}</span>
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
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <GraphContext.Provider value={{ bigNodes, onParentChange: handleParentChange }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            className="bg-[#f5f5fa]"
          >
            <Controls position="bottom-left" className="!bg-white !border-gray-200 !shadow-sm [&>button]:!bg-white [&>button]:!border-gray-200 [&>button]:!text-gray-600 [&>button:hover]:!bg-gray-50" />
            <MiniMap
              position="bottom-right"
              nodeColor={(n) => NODE_TYPE_MAP[n.type || '']?.color || '#6b7280'}
              maskColor="rgba(255,255,255,0.7)"
              className="!bg-white !border-gray-200"
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />

            {/* Breadcrumb navigation */}
            {cloudStack.length > 0 && (
              <Panel position="top-center" className="!m-3">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2 flex items-center gap-1 text-xs">
                  <button
                    onClick={() => handleNavigateBack(-1)}
                    className="px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors"
                  >
                    Home
                  </button>
                  {cloudStack.map((level, i) => (
                    <span key={level.id} className="flex items-center gap-1">
                      <span className="text-gray-300">/</span>
                      {i < cloudStack.length - 1 ? (
                        <button
                          onClick={() => handleNavigateBack(i + 1)}
                          className="px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors"
                        >
                          {level.title}
                        </button>
                      ) : (
                        <span className="px-2 py-1 text-indigo-600 font-semibold">{level.title}</span>
                      )}
                    </span>
                  ))}
                </div>
              </Panel>
            )}

            {/* Top toolbar */}
            <Panel position="top-left" className="!m-3">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 flex items-center gap-1">
                <button
                  onClick={() => setSidebarOpen(s => !s)}
                  className="px-2 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Toggle node palette"
                >
                  {sidebarOpen ? '\u25C0' : '\u25B6'} Nodes
                </button>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={publish}
                  disabled={publishing}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-white transition-colors"
                >
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button
                  onClick={copyForAI}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-indigo-600 hover:bg-gray-100 transition-colors"
                  title="Copy graph as text for AI"
                >
                  {'\u{1F4CB}'} Copy for AI
                </button>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="Import file (TXT, MD, DOCX)"
                >
                  {importing ? 'Importing...' : '\u{1F4C4} Import'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.docx,.pdf"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </div>
            </Panel>
          </ReactFlow>
        </GraphContext.Provider>
      </div>

      {/* Node Editor Panel (n8n-style) */}
      <NodePanel
        node={nodes.find(n => n.id === selectedNodeId) || null}
        nodes={nodes}
        edges={edges}
        onClose={() => setSelectedNodeId(null)}
        onUpdate={handlePanelUpdate}
        onDelete={handleDeleteNode}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-md text-sm z-50 text-gray-800">
          {toast}
        </div>
      )}
    </div>
  );
}
