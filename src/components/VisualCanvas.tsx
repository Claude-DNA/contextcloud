'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import GraphNodeComponent from '@/components/graph/GraphNode';
import { NODE_TYPES, NODE_TYPE_MAP, STATE_COLORS, type NodeTypeConfig } from '@/components/graph/nodeTypes';
import { GraphContext } from '@/components/graph/GraphContext';
import NodePanel from '@/components/graph/NodePanel';
import DraftBrowser from '@/components/graph/DraftBrowser';

// Register all node types to the same GraphNode component
const nodeTypes: Record<string, typeof GraphNodeComponent> = {};
for (const nt of NODE_TYPES) {
  nodeTypes[nt.type] = GraphNodeComponent;
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
  const [showDraftBrowser, setShowDraftBrowser] = useState(false);
  const nodeCounter = useRef(0);
  const windowJustFocused = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingIdeas, setImportingIdeas] = useState(false);
  const [importingArcs, setImportingArcs] = useState(false);
  const [importingCloud, setImportingCloud] = useState(false);
  const [exportingRunway, setExportingRunway] = useState(false);

  // Scene mode
  const searchParams = useSearchParams();
  const sceneId = searchParams.get('scene') || null;
  const sceneNameParam = searchParams.get('sceneName') || null;
  const [sceneName, setSceneName] = useState<string | null>(sceneNameParam);
  const sceneLoaded = useRef(false);
  const pendingSyncRef = useRef<Record<string, { title?: string; content?: string }>>({});
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Bulk delete — triggered by keyboard Delete/Backspace on selected nodes
  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map(n => n.id));
    setEdges(eds => eds.filter(e => !ids.has(e.source) && !ids.has(e.target)));
    setSelectedNodeId(prev => (prev && ids.has(prev) ? null : prev));
  }, [setEdges]);

  // Track how many nodes are currently selected for the toolbar button
  const [selectedCount, setSelectedCount] = useState(0);
  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedCount(sel.length);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const selected = reactFlowInstance.getNodes().filter(n => n.selected);
    if (selected.length === 0) return;
    const ids = new Set(selected.map(n => n.id));
    setNodes(nds => nds.filter(n => !ids.has(n.id)));
    setEdges(eds => eds.filter(e => !ids.has(e.source) && !ids.has(e.target)));
    setSelectedNodeId(prev => (prev && ids.has(prev) ? null : prev));
    setSelectedCount(0);
  }, [reactFlowInstance, setNodes, setEdges]);

  // Sync ref — filled in later, used by handlers
  const scheduleSyncRef = useRef<(nodeId: string, field: 'title' | 'content', value: string) => void>(() => {});

  // Node data change handlers
  const handleTitleChange = useCallback((nodeId: string, newTitle: string) => {
    setNodes(nds =>
      nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, title: newTitle } } : n)
    );
    scheduleSyncRef.current(nodeId, 'title', newTitle);
  }, [setNodes]);

  const handleContentChange = useCallback((nodeId: string, newContent: string) => {
    setNodes(nds =>
      nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, content: newContent } } : n)
    );
    scheduleSyncRef.current(nodeId, 'content', newContent);
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

  // Node click handlers
  // Prevent refocus-click from closing the node panel when Alt+Tabbing back
  useEffect(() => {
    const handleFocus = () => {
      windowJustFocused.current = true;
      setTimeout(() => { windowJustFocused.current = false; }, 300);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => {
    if (windowJustFocused.current) return;
    setSelectedNodeId(null);
  }, []);

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
      },
    };
    setNodes(nds => [...nds, newNode]);
  }, [setNodes, draftId, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode]);

  // Import Ideas from Ideas Cloud
  const importIdeas = useCallback(async () => {
    setImportingIdeas(true);
    try {
      const res = await fetch('/api/v1/ideas');
      const data = await res.json();
      const ideas: Array<{ id: string; text: string; weight: number }> = data.ideas || [];
      if (!ideas.length) { showToast('No ideas in Ideas Cloud'); return; }

      const newNodes: Node[] = ideas.map((idea, i) => ({
        id: `idea_import_${idea.id}`,
        type: 'theme',
        position: { x: -320, y: 60 + i * 160 },
        dragging: false,
        selected: false,
        data: {
          type: 'theme',
          label: 'Idea',
          emoji: '💡',
          color: '#f59e0b',
          title: idea.text.slice(0, 80),
          content: `Weight: ${Math.round((idea.weight ?? 0) * 100)}%`,
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
        },
      }));

      setNodes(nds => {
        const existingIds = new Set(nds.map(n => n.id));
        return [...nds, ...newNodes.filter(n => !existingIds.has(n.id))];
      });
      showToast(`Imported ${newNodes.length} idea${newNodes.length !== 1 ? 's' : ''}`);
      setTimeout(() => reactFlowInstance.fitView({ duration: 500 }), 200);
    } catch {
      showToast('Failed to import ideas');
    } finally {
      setImportingIdeas(false);
    }
  }, [draftId, setNodes, showToast, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, reactFlowInstance]);

  // Import Arcs from Arc Cloud
  const importArcs = useCallback(async () => {
    setImportingArcs(true);
    try {
      const arcsRes = await fetch('/api/v1/arcs');
      const arcsData = await arcsRes.json();
      const arcs: Array<{ id: string; name: string; description?: string }> = arcsData.arcs || [];
      if (!arcs.length) { showToast('No arcs in Arc Cloud'); return; }

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      let xOffset = 400;

      for (const arc of arcs) {
        const arcNodeId = `arc_import_${arc.id}`;
        newNodes.push({
          id: arcNodeId,
          type: 'arc',
          position: { x: xOffset, y: 60 },
          dragging: false, selected: false,
          data: {
            type: 'arc', label: 'Arc', emoji: '📈', color: '#0891b2',
            title: arc.name, content: arc.description || '',
            isProxy: false, isContainer: false, stateColor: null,
            parentNodeId: '', parentLabel: '', graphId: draftId,
            onTitleChange: handleTitleChange, onContentChange: handleContentChange,
            onZoomToParent, onStateColorChange: handleStateColorChange,
            onImageGenerated: handleImageGenerated, onDelete: handleDeleteNode,
          },
        });

        // Fetch chapters + plots for this arc
        let chapters: Array<{ id: string; name: string; description?: string; plots: Array<{ id: string; name?: string; title?: string; content?: string }> }> = [];
        try {
          const chapRes = await fetch(`/api/v1/arcs/${arc.id}/chapters`);
          const chapData = await chapRes.json();
          chapters = chapData.chapters || [];
        } catch { /* no chapters */ }

        let yOffset = 240;
        for (let ci = 0; ci < chapters.length; ci++) {
          const chapter = chapters[ci];
          const chapNodeId = `chap_import_${chapter.id}`;
          // Chapters laid out horizontally in a chain to the right of the arc
          const chapX = xOffset + 260 + ci * 280;
          const chapY = 60;
          newNodes.push({
            id: chapNodeId,
            type: 'chapterAct',
            position: { x: chapX, y: chapY },
            dragging: false, selected: false,
            data: {
              type: 'chapterAct', label: 'Chapter / Act', emoji: '📑', color: '#4A90D9',
              title: chapter.name,
            content: (chapter.plots || [])
              .map((p: { name?: string; content?: string }) =>
                [p.name, p.content].filter(Boolean).join(': ')
              )
              .join('\n') || '',
              chapterId: chapter.id,
              isProxy: false, isContainer: false, stateColor: null,
              parentNodeId: '', parentLabel: '', graphId: draftId,
              onTitleChange: handleTitleChange, onContentChange: handleContentChange,
              onZoomToParent, onStateColorChange: handleStateColorChange,
              onImageGenerated: handleImageGenerated, onDelete: handleDeleteNode,
            },
          });

          // Proxy nodes below each chapter — Characters, World, References, Ideas
          const proxyDefs = [
            { type: 'charactersProxy', color: '#6366f1', label: 'Characters', emoji: '👤', dx: 0,   dy: 200 },
            { type: 'world',           color: '#06B6D4', label: 'World',      emoji: '🌍', dx: 170,  dy: 200 },
            { type: 'reference',       color: '#F97316', label: 'References', emoji: '📑', dx: -170, dy: 200 },
            { type: 'ideasProxy',      color: '#eab308', label: 'Ideas',      emoji: '💡', dx: 0,   dy: 340 },
          ];
          for (const pd of proxyDefs) {
            const proxyId = `proxy_${pd.type}_ch${ci}_${arc.id}`;
            newNodes.push({
              id: proxyId,
              type: pd.type,
              position: { x: chapX + pd.dx, y: chapY + pd.dy },
              dragging: false, selected: false,
              data: {
                type: pd.type, label: pd.label, emoji: pd.emoji, color: pd.color,
                title: `${pd.label}`, content: '[]',
                isProxy: true, isContainer: false, stateColor: null,
                parentNodeId: chapNodeId, parentLabel: chapter.name, graphId: draftId,
                onTitleChange: handleTitleChange, onContentChange: handleContentChange,
                onZoomToParent, onStateColorChange: handleStateColorChange,
                onImageGenerated: handleImageGenerated, onDelete: handleDeleteNode,
              },
            });
            newEdges.push({
              id: `e_proxy_${proxyId}`,
              source: chapNodeId,
              target: proxyId,
              animated: false,
              style: { stroke: pd.color, strokeWidth: 1.5, opacity: 0.5 },
            });
          }

          if (ci === 0) {
            // Arc → first chapter only
            newEdges.push({
              id: `e_arc_ch0_${arcNodeId}`,
              source: arcNodeId,
              sourceHandle: 'chapters_out',
              target: chapNodeId,
              targetHandle: 'arc',
              animated: true,
              style: { stroke: '#0891b2', strokeDasharray: '5 5' },
            });
          } else {
            // Chapter chain: prev chapter Out → this chapter In
            const prevChapId = `chap_import_${chapters[ci - 1].id}`;
            newEdges.push({
              id: `e_chap_chain_${ci}`,
              source: prevChapId,
              sourceHandle: 'next_chapter',
              target: chapNodeId,
              targetHandle: 'prev_chapter',
              animated: true,
              style: { stroke: '#4A90D9', strokeDasharray: '5 5' },
            });
          }
          // Plots are inside the chapter sub-canvas — not shown in main canvas
        }
        xOffset += 260 + chapters.length * 280 + 60;
      }

      setNodes(nds => {
        const existingIds = new Set(nds.map(n => n.id));
        return [...nds, ...newNodes.filter(n => !existingIds.has(n.id))];
      });
      setEdges(eds => [...eds, ...newEdges]);
      showToast(`Imported ${arcs.length} arc${arcs.length !== 1 ? 's' : ''} from Arc Cloud`);
      setTimeout(() => reactFlowInstance.fitView({ duration: 500 }), 200);
    } catch {
      showToast('Failed to import arcs');
    } finally {
      setImportingArcs(false);
    }
  }, [draftId, setNodes, setEdges, showToast, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, reactFlowInstance]);

  // Import from Cloud (all cloud_items → visual nodes)
  const importFromCloud = useCallback(async () => {
    setImportingCloud(true);
    try {
      const res = await fetch('/api/v1/cloud-items/to-nodes');
      const data = await res.json();
      const cloudNodes: Array<{ id: string; type: string; title: string; content: string; position: { x: number; y: number } }> = data.nodes || [];
      if (!cloudNodes.length) { showToast('No cloud items to import'); return; }

      const newNodes: Node[] = cloudNodes.map((cn) => {
        const config = NODE_TYPE_MAP[cn.type];
        return {
          id: cn.id,
          type: cn.type,
          position: cn.position,
          dragging: false,
          selected: false,
          data: {
            type: cn.type,
            label: config?.label || cn.type,
            emoji: config?.emoji || '',
            color: config?.color || '#4A90D9',
            title: cn.title,
            content: cn.content,
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
          },
        };
      });

      setNodes(nds => {
        const existingIds = new Set(nds.map(n => n.id));
        return [...nds, ...newNodes.filter(n => !existingIds.has(n.id))];
      });
      showToast(`${newNodes.length} item${newNodes.length !== 1 ? 's' : ''} imported from Cloud`);
      // With many nodes React Flow needs time to measure before fitView works — retry at 800ms and 2s
      setTimeout(() => reactFlowInstance.fitView({ duration: 500, padding: 0.15 }), 800);
      setTimeout(() => reactFlowInstance.fitView({ duration: 400, padding: 0.15 }), 2000);
    } catch {
      showToast('Failed to import from Cloud');
    } finally {
      setImportingCloud(false);
    }
  }, [draftId, setNodes, showToast, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, reactFlowInstance]);

  // Load scene items (scene mode)
  const loadSceneItems = useCallback(async () => {
    if (!sceneId) return;
    setImportingCloud(true);
    try {
      const res = await fetch(`/api/v1/arc-scenes/${sceneId}/items`);
      const data = await res.json();
      const items: Array<{ id: string; cloud_type: string; title: string; content: string; metadata?: Record<string, unknown> }> = data.items || [];

      if (!items.length) { showToast('No items attached to this scene'); return; }

      // Same type mapping as to-nodes
      const CLOUD_TYPE_TO_NODE: Record<string, string> = {
        characters: 'character', scenes: 'scene', world: 'world', ideas: 'theme', arc: 'chapterAct',
      };
      const REF_TYPE_MAP: Record<string, string> = {
        music: 'musicReference', film: 'filmReference', book: 'bookReference', art: 'artReference', 'real event': 'realEventReference',
      };
      function mapType(cloudType: string, metadata?: Record<string, unknown>): string {
        if (cloudType === 'references') {
          const refType = (metadata?.refType as string || '').toLowerCase();
          return REF_TYPE_MAP[refType] || 'bookReference';
        }
        return CLOUD_TYPE_TO_NODE[cloudType] || 'theme';
      }

      // Group by type for column layout
      const byType = new Map<string, typeof items>();
      for (const item of items) {
        const list = byType.get(item.cloud_type) || [];
        list.push(item);
        byType.set(item.cloud_type, list);
      }

      const newNodes: Node[] = [];
      let colIndex = 0;
      for (const [, typeItems] of byType) {
        const x = 80 + colIndex * 380;
        typeItems.forEach((item, rowIndex) => {
          const metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata || '{}') : (item.metadata || {});
          const nodeType = mapType(item.cloud_type, metadata);
          const config = NODE_TYPE_MAP[nodeType];
          newNodes.push({
            id: `cloud_${item.id}`,
            type: nodeType,
            position: { x, y: 80 + rowIndex * 220 },
            dragging: false,
            selected: false,
            data: {
              type: nodeType,
              label: config?.label || nodeType,
              emoji: config?.emoji || '',
              color: config?.color || '#4A90D9',
              title: item.title,
              content: item.content || '',
              isProxy: false, isContainer: false, stateColor: null,
              parentNodeId: '', parentLabel: '', graphId: draftId,
              onTitleChange: handleTitleChange, onContentChange: handleContentChange,
              onZoomToParent, onStateColorChange: handleStateColorChange,
              onImageGenerated: handleImageGenerated, onDelete: handleDeleteNode,
            },
          });
        });
        colIndex++;
      }

      setNodes(newNodes);
      showToast(`${newNodes.length} item${newNodes.length !== 1 ? 's' : ''} loaded from scene`);
      setTimeout(() => reactFlowInstance.fitView({ duration: 500, padding: 0.15 }), 800);
      setTimeout(() => reactFlowInstance.fitView({ duration: 400, padding: 0.15 }), 2000);
    } catch {
      showToast('Failed to load scene items');
    } finally {
      setImportingCloud(false);
    }
  }, [sceneId, draftId, setNodes, showToast, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, reactFlowInstance]);

  // Auto-load scene items on mount in scene mode
  useEffect(() => {
    if (sceneId && !sceneLoaded.current && nodes.length === 0) {
      sceneLoaded.current = true;
      loadSceneItems();
    }
  }, [sceneId, nodes.length, loadSceneItems]);

  // Fetch scene name if not provided via query param
  useEffect(() => {
    if (sceneId && !sceneName) {
      fetch(`/api/v1/arc-scenes/${sceneId}/scene-info`)
        .then(r => r.json())
        .then(d => { if (d.title) setSceneName(d.title); })
        .catch(() => {});
    }
  }, [sceneId, sceneName]);

  // Debounced sync back to cloud_items
  const flushSync = useCallback(() => {
    const pending = { ...pendingSyncRef.current };
    pendingSyncRef.current = {};
    for (const [itemId, changes] of Object.entries(pending)) {
      fetch(`/api/v1/cloud-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      }).catch(() => {
        showToast('Failed to sync changes to cloud');
      });
    }
  }, [showToast]);

  const scheduleSyncForNode = useCallback((nodeId: string, field: 'title' | 'content', value: string) => {
    if (!nodeId.startsWith('cloud_')) return;
    const itemId = nodeId.replace('cloud_', '');
    pendingSyncRef.current[itemId] = {
      ...pendingSyncRef.current[itemId],
      [field]: value,
    };
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(flushSync, 1000);
  }, [flushSync]);

  // Wire up the sync ref so handlers can call it
  scheduleSyncRef.current = sceneId ? scheduleSyncForNode : () => {};

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

  // --- Save: serialize node data for persistence ---
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
      // Arc node fields
      if (n.data.events) clean.events = n.data.events;
      if (n.data.description) clean.description = n.data.description;
      // Motivation node fields
      if (n.data.trigger) clean.trigger = n.data.trigger;
      if (n.data.rootCause) clean.rootCause = n.data.rootCause;
      if (n.data.duration) clean.duration = n.data.duration;
      if (n.data.resolution) clean.resolution = n.data.resolution;
      // AI node fields
      if (n.data.model) clean.model = n.data.model;
      if (n.data.apiKey) clean.apiKey = n.data.apiKey;
      if (n.data.systemPrompt) clean.systemPrompt = n.data.systemPrompt;
      if (n.data.temperature !== undefined) clean.temperature = n.data.temperature;
      if (n.data.instructions) clean.instructions = n.data.instructions;
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

      if (data.saved && data.items) {
        // File import now saves to cloud_items — user imports to canvas via "Import from Cloud"
        showToast(`${data.saved} items saved to your clouds — click Import from Cloud to view them`);
      }
    } catch {
      showToast('Import failed');
    }
    setImporting(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [showToast]);

  // Categorized node types for sidebar
  const categorized = useMemo(() => {
    return {
      content: NODE_TYPES.filter(n => n.category === 'content' && !n.isProxy),
      narrative: NODE_TYPES.filter(n => n.category === 'narrative' as NodeTypeConfig['category']),
      proxy: NODE_TYPES.filter(n => n.isProxy === true),
      reference: NODE_TYPES.filter(n => n.category === 'reference'),
      meta: NODE_TYPES.filter(n => n.category === 'meta'),
      container: NODE_TYPES.filter(n => n.category === 'container'),
    };
  }, []);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted">
        Please sign in to use the visual editor.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Standalone mode banner — shown when not opened from a scene */}
      {!sceneId && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 shrink-0">
          <span>Visual Editor — standalone mode</span>
          <a href="/workspace/arc-cloud" className="text-accent hover:underline">Go to Arc Cloud &rarr;</a>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
      {/* Node type sidebar */}
      {sidebarOpen && (
        <div className="w-56 bg-white border-r border-gray-200 overflow-y-auto shrink-0" onMouseDown={e => e.stopPropagation()}>
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

            {/* Import from Clouds — prominent, above node palette */}
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-emerald-100 bg-emerald-100">
                <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Import from Clouds</span>
              </div>
              <div className="p-1.5 space-y-0.5">
                <button
                  onClick={importIdeas}
                  disabled={importingIdeas}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-emerald-100 transition-colors flex items-center gap-2 text-gray-700 disabled:opacity-50"
                >
                  <span>💡</span>
                  <span>{importingIdeas ? 'Importing...' : 'Ideas Cloud'}</span>
                </button>
                <button
                  onClick={importArcs}
                  disabled={importingArcs}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-emerald-100 transition-colors flex items-center gap-2 text-gray-700 disabled:opacity-50"
                >
                  <span>📖</span>
                  <span>{importingArcs ? 'Importing...' : 'Arc Cloud'}</span>
                </button>
                <button
                  onClick={sceneId ? loadSceneItems : importFromCloud}
                  disabled={importingCloud}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-emerald-100 transition-colors flex items-center gap-2 text-gray-700 disabled:opacity-50"
                >
                  <span>☁️</span>
                  <span>{importingCloud ? 'Loading...' : sceneId ? 'Reload Scene Items' : 'Import from Cloud'}</span>
                </button>
                <button
                  onClick={async () => {
                    setExportingRunway(true);
                    try {
                      let projectTitle: string | undefined;
                      try { projectTitle = localStorage.getItem('cc_chat_title') || undefined; } catch { /* ignore */ }
                      const res = await fetch('/api/v1/export/runway', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project_title: projectTitle }),
                      });
                      if (!res.ok) throw new Error('Export failed');
                      const manifest = await res.json();
                      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${(manifest.project || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_')}-runway-manifest.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch { /* ignore */ }
                    setExportingRunway(false);
                  }}
                  disabled={exportingRunway}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-emerald-100 transition-colors flex items-center gap-2 text-gray-700 disabled:opacity-50"
                >
                  <span>🎬</span>
                  <span>{exportingRunway ? 'Generating...' : 'Export for Runway'}</span>
                </button>
              </div>
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

            {/* Narrative Nodes */}
            {categorized.narrative.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-cyan-600 font-medium mb-2">Narrative</div>
                <div className="space-y-0.5">
                  {categorized.narrative.map(nt => (
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
            onNodesDelete={onNodesDelete}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Backspace', 'Delete']}
            selectionOnDrag={true}
            panOnDrag={[1, 2]}
            panOnScroll={true}
            panActivationKeyCode="Space"
            multiSelectionKeyCode="Shift"
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

            {/* Scene banner */}
            {sceneId && (
              <Panel position="top-center" className="!m-0">
                <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 text-sm shadow-sm rounded-b-lg">
                  <span className="text-gray-500">Scene:</span>
                  <span className="font-medium text-gray-800">{sceneName || 'Loading...'}</span>
                  <a
                    href="/workspace/arc-cloud"
                    className="ml-3 text-xs text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                  >
                    Back to Arc Cloud
                  </a>
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
                  onClick={() => setShowDraftBrowser(true)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Open existing draft"
                >
                  Open
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
                {selectedCount > 0 && (
                  <>
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <button
                      onClick={handleDeleteSelected}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
                      title={`Delete ${selectedCount} selected node${selectedCount > 1 ? 's' : ''}`}
                    >
                      🗑 Delete {selectedCount}
                    </button>
                  </>
                )}
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

      {showDraftBrowser && (
        <DraftBrowser
          onLoad={(loadedNodes, loadedEdges, loadedTitle, loadedDraftId) => {
            setNodes(loadedNodes);
            setEdges(loadedEdges);
            setTitle(loadedTitle);
            setDraftId(loadedDraftId);
            setShowDraftBrowser(false);
          }}
          onClose={() => setShowDraftBrowser(false)}
        />
      )}

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
    </div>
  );
}
