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
import { useProject } from '@/context/ProjectContext';

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
  const { activeProjectId, projects } = useProject();

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
  const [importingCloud, setImportingCloud] = useState(false);
  const [exportingRunway, setExportingRunway] = useState(false);
  // Cloud load modal state
  const [showCloudLoadModal, setShowCloudLoadModal] = useState(false);
  const [cloudLoadLoading, setCloudLoadLoading] = useState(false);
  const [cloudLoadGroups, setCloudLoadGroups] = useState<Record<string, Array<{ id: string; type: string; cloud_type: string; title: string; content: string; position: { x: number; y: number } }>>>({});
  const [cloudLoadChecked, setCloudLoadChecked] = useState<Set<string>>(new Set());
  const [cloudLoadCollapsed, setCloudLoadCollapsed] = useState<Set<string>>(new Set());

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

  // Add node — place at viewport center so it's always visible
  const addNode = useCallback((config: NodeTypeConfig) => {
    nodeCounter.current += 1;
    const id = `node_${nodeCounter.current}_${Date.now()}`;
    // Convert the center of the visible canvas to flow coordinates
    const centerPos = (() => {
      try {
        const vp = reactFlowInstance.getViewport();
        // getViewport returns { x, y, zoom } — x/y are the pan offset
        // The center of the screen in flow coords:
        const el = document.querySelector('.react-flow') as HTMLElement | null;
        const w = el?.clientWidth ?? 800;
        const h = el?.clientHeight ?? 600;
        return reactFlowInstance.screenToFlowPosition({ x: w / 2, y: h / 2 });
      } catch {
        return { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 };
      }
    })();
    const newNode: Node = {
      id,
      type: config.type,
      position: { x: centerPos.x + (Math.random() - 0.5) * 120, y: centerPos.y + (Math.random() - 0.5) * 80 },
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
  }, [setNodes, draftId, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, reactFlowInstance]);

  // Import cloud nodes into the canvas (used by both direct load and modal)
  const loadCloudNodesToCanvas = useCallback((cloudNodes: Array<{ id: string; type: string; title: string; content: string; position: { x: number; y: number } }>) => {
    if (!cloudNodes.length) { showToast('No items to load'); return; }

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
    showToast(`${newNodes.length} item${newNodes.length !== 1 ? 's' : ''} loaded from Cloud`);
    setTimeout(() => reactFlowInstance.fitView({ duration: 500, padding: 0.15 }), 800);
    setTimeout(() => reactFlowInstance.fitView({ duration: 400, padding: 0.15 }), 2000);
  }, [draftId, setNodes, showToast, handleTitleChange, handleContentChange, onZoomToParent, handleStateColorChange, handleImageGenerated, handleDeleteNode, reactFlowInstance]);

  // Build API URL with project_id
  const cloudItemsUrl = useMemo(() => {
    const base = '/api/v1/cloud-items/to-nodes';
    return activeProjectId ? `${base}?project_id=${activeProjectId}` : base;
  }, [activeProjectId]);

  // Open the cloud load modal — fetch items and group by cloud_type
  const openCloudLoadModal = useCallback(async () => {
    setShowCloudLoadModal(true);
    setCloudLoadLoading(true);
    try {
      const res = await fetch(cloudItemsUrl);
      const data = await res.json();
      const allNodes: Array<{ id: string; type: string; cloud_type: string; title: string; content: string; position: { x: number; y: number } }> = data.nodes || [];
      // Group by cloud_type
      const groups: Record<string, typeof allNodes> = {};
      for (const n of allNodes) {
        const ct = n.cloud_type || 'other';
        if (!groups[ct]) groups[ct] = [];
        groups[ct].push(n);
      }
      setCloudLoadGroups(groups);
      // Check all by default
      setCloudLoadChecked(new Set(allNodes.map(n => n.id)));
      setCloudLoadCollapsed(new Set());
    } catch {
      showToast('Failed to fetch cloud items');
      setShowCloudLoadModal(false);
    } finally {
      setCloudLoadLoading(false);
    }
  }, [cloudItemsUrl, showToast]);

  // Load checked items from modal
  const handleCloudLoadConfirm = useCallback(() => {
    const allItems = Object.values(cloudLoadGroups).flat();
    const selected = allItems.filter(item => cloudLoadChecked.has(item.id));
    loadCloudNodesToCanvas(selected);
    setShowCloudLoadModal(false);
  }, [cloudLoadGroups, cloudLoadChecked, loadCloudNodesToCanvas]);

  // Direct import (used by scene mode)
  const importFromCloud = useCallback(async () => {
    setImportingCloud(true);
    try {
      const res = await fetch(cloudItemsUrl);
      const data = await res.json();
      loadCloudNodesToCanvas(data.nodes || []);
    } catch {
      showToast('Failed to import from Cloud');
    } finally {
      setImportingCloud(false);
    }
  }, [cloudItemsUrl, loadCloudNodesToCanvas, showToast]);

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
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="Export manifest for Runway"
                >
                  {exportingRunway ? 'Exporting...' : '\u{1F3AC} Runway'}
                </button>
                {selectedCount > 0 && (
                  <>
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <button
                      onClick={handleDeleteSelected}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
                      title={`Delete ${selectedCount} selected node${selectedCount > 1 ? 's' : ''}`}
                    >
                      {'\u{1F5D1}'} Delete {selectedCount}
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
                <button
                  onClick={sceneId ? loadSceneItems : openCloudLoadModal}
                  disabled={importingCloud}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  title="Load items from your clouds"
                >
                  {importingCloud ? 'Loading...' : sceneId ? '\u{2601}\u{FE0F} Reload Scene' : '\u{2601}\u{FE0F} Load from Cloud'}
                </button>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="Upload file (TXT, MD, DOCX)"
                >
                  {importing ? 'Uploading...' : '\u{1F4E4} Upload File'}
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

      {/* Cloud Load Modal */}
      {showCloudLoadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCloudLoadModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Load Cloud Items</h2>
                {activeProjectId && (
                  <span className="text-xs text-gray-500">
                    Project: {projects.find(p => p.id === activeProjectId)?.title || 'Selected project'}
                  </span>
                )}
              </div>
              <button onClick={() => setShowCloudLoadModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {cloudLoadLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Loading items...
                </div>
              ) : Object.keys(cloudLoadGroups).length === 0 ? (
                <div className="text-center py-12 text-gray-400">No cloud items found{activeProjectId ? ' for this project' : ''}.</div>
              ) : (
                Object.entries(cloudLoadGroups).map(([cloudType, items]) => {
                  const CLOUD_TYPE_LABELS: Record<string, string> = {
                    characters: 'Characters', scenes: 'Stage', world: 'World',
                    ideas: 'Ideas', references: 'References', arc: 'Arc',
                  };
                  const CLOUD_TYPE_EMOJI: Record<string, string> = {
                    characters: '\u{1F464}', scenes: '\u{1F3AC}', world: '\u{1F30D}',
                    ideas: '\u{1F4A1}', references: '\u{1F4D1}', arc: '\u{1F4C8}',
                  };
                  const label = CLOUD_TYPE_LABELS[cloudType] || cloudType;
                  const emoji = CLOUD_TYPE_EMOJI[cloudType] || '\u{2601}\u{FE0F}';
                  const isCollapsed = cloudLoadCollapsed.has(cloudType);
                  const groupCheckedCount = items.filter(i => cloudLoadChecked.has(i.id)).length;
                  const allChecked = groupCheckedCount === items.length;

                  return (
                    <div key={cloudType} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                        onClick={() => setCloudLoadCollapsed(prev => {
                          const next = new Set(prev);
                          isCollapsed ? next.delete(cloudType) : next.add(cloudType);
                          return next;
                        })}
                      >
                        <span className="text-xs text-gray-400">{isCollapsed ? '\u{25B6}' : '\u{25BC}'}</span>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={e => {
                            e.stopPropagation();
                            setCloudLoadChecked(prev => {
                              const next = new Set(prev);
                              items.forEach(i => allChecked ? next.delete(i.id) : next.add(i.id));
                              return next;
                            });
                          }}
                          className="rounded border-gray-300"
                        />
                        <span>{emoji}</span>
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                        <span className="text-xs text-gray-400 ml-auto">{groupCheckedCount}/{items.length}</span>
                      </div>
                      {!isCollapsed && (
                        <div className="px-3 py-1 space-y-0.5 max-h-48 overflow-y-auto">
                          {items.map(item => (
                            <label key={item.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={cloudLoadChecked.has(item.id)}
                                onChange={() => setCloudLoadChecked(prev => {
                                  const next = new Set(prev);
                                  next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                  return next;
                                })}
                                className="rounded border-gray-300"
                              />
                              <span className="text-gray-700 truncate">{item.title || '(untitled)'}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {!cloudLoadLoading && Object.keys(cloudLoadGroups).length > 0 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowCloudLoadModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCloudLoadConfirm}
                  disabled={cloudLoadChecked.size === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  Load Selected ({cloudLoadChecked.size})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
