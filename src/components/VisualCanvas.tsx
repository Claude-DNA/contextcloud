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

// ─── Cloud type → visual node type mapping ───────────────────────────────────
const CLOUD_TYPE_TO_NODE: Record<string, string> = {
  characters: 'character',
  scenes: 'scene',
  world: 'world',
  ideas: 'theme',
  arc: 'chapterAct',
};
const REF_TYPE_MAP: Record<string, string> = {
  music: 'musicReference',
  film: 'filmReference',
  book: 'bookReference',
  art: 'artReference',
  'real event': 'realEventReference',
};
function mapCloudType(cloudType: string, metadata?: Record<string, unknown>): string {
  if (cloudType === 'references') {
    const refType = ((metadata?.refType as string) || '').toLowerCase();
    return REF_TYPE_MAP[refType] || 'bookReference';
  }
  return CLOUD_TYPE_TO_NODE[cloudType] || 'theme';
}

// ─── Smart pre-selection for scene checklist ─────────────────────────────────
function smartPreselect(items: CloudModalItem[], sceneTitle: string, sceneContent: string): Set<string> {
  const nonArc = items.filter(i => i.cloud_type !== 'arc');
  if (nonArc.length <= 15) return new Set(nonArc.map(i => i.id));
  const keywords = (sceneTitle + ' ' + sceneContent).toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const hit = new Set<string>();
  for (const item of nonArc) {
    const text = (item.title + ' ' + (item.content || '')).toLowerCase();
    if (keywords.some(k => text.includes(k))) hit.add(item.id);
  }
  if (hit.size < 5) nonArc.slice(0, 30).forEach(i => hit.add(i.id));
  return hit;
}

// ─── AI serialiser ────────────────────────────────────────────────────────────
function serializeGraphForAI(title: string, nodes: Node[], edges: Edge[]): string {
  const sections: Record<string, string[]> = { content: [], reference: [], meta: [] };
  for (const node of nodes) {
    const config = NODE_TYPE_MAP[node.type || ''];
    if (!config) continue;
    const t = (node.data?.title as string) || '';
    const c = (node.data?.content as string) || '';
    const line =
      config.category === 'reference'
        ? `${config.emoji} ${config.label.toUpperCase()}: ${t}${c ? ' — ' + c : ''}`
        : config.category === 'meta'
          ? `${config.emoji} ${config.label.toUpperCase()}: ${c || t}`
          : `${config.emoji} ${config.label.toUpperCase()}: ${t}\n${c}`;
    sections[config.category].push(line);
  }
  const edgeLines = edges.map(e => {
    const src = nodes.find(n => n.id === e.source);
    const tgt = nodes.find(n => n.id === e.target);
    return `  ${(src?.data?.title as string) || src?.type || '?'} -> ${(tgt?.data?.title as string) || tgt?.type || '?'}`;
  });
  let out = `=== CONTEXT GRAPH: ${title} ===\n\n`;
  if (sections.content.length) out += `[CONTENT NODES]\n${sections.content.join('\n\n')}\n\n`;
  if (sections.reference.length) out += `[REFERENCE NODES]\n${sections.reference.join('\n')}\n\n`;
  if (sections.meta.length) out += `[META]\n${sections.meta.join('\n')}\n\n`;
  if (edgeLines.length) out += `[CONNECTIONS]\n${edgeLines.join('\n')}\n\n`;
  out += `=== END GRAPH ===`;
  return out;
}

// ─── History types ─────────────────────────────────────────────────────────────
type HistoryNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: Record<string, unknown>;
};
type HistorySnap = { nodes: HistoryNode[]; edges: Edge[] };

function snapshotNode(n: Node): HistoryNode {
  return {
    id: n.id,
    type: n.type,
    position: { ...n.position },
    width: n.width,
    height: n.height,
    data: {
      type: n.data.type,
      label: n.data.label,
      emoji: n.data.emoji,
      color: n.data.color,
      title: n.data.title,
      content: n.data.content,
      isProxy: n.data.isProxy,
      isContainer: n.data.isContainer,
      stateColor: n.data.stateColor,
      parentNodeId: n.data.parentNodeId,
      parentLabel: n.data.parentLabel,
      generatedImage: n.data.generatedImage,
      graphId: n.data.graphId,
      externalTitle: n.data.externalTitle,
      thumbnail: n.data.thumbnail,
      externalUrl: n.data.externalUrl,
      source: n.data.source,
      events: n.data.events,
      description: n.data.description,
      trigger: n.data.trigger,
      rootCause: n.data.rootCause,
      duration: n.data.duration,
      resolution: n.data.resolution,
      model: n.data.model,
      systemPrompt: n.data.systemPrompt,
      temperature: n.data.temperature,
      instructions: n.data.instructions,
    },
  };
}

// ─── Cloud load modal types ───────────────────────────────────────────────────
interface CloudModalItem {
  id: string;
  type: string;
  cloud_type: string;
  title: string;
  content: string;
  position: { x: number; y: number };
}
interface BuildNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { title: string; content?: string; type: string };
}
interface BuildEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
  style?: Record<string, unknown>;
}
interface SceneListItem {
  id: string;
  title: string;
  content: string;
  attached_count: number;
}
interface SceneItem {
  id: string;
  cloud_type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
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
  const [autoBuilding, setAutoBuilding] = useState(false);
  const [showDraftBrowser, setShowDraftBrowser] = useState(false);
  const nodeCounter = useRef(0);
  const windowJustFocused = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingCloud, setImportingCloud] = useState(false);
  const [exportingRunway, setExportingRunway] = useState(false);

  // ── Cloud load modal ────────────────────────────────────────────────────────
  const [showCloudLoadModal, setShowCloudLoadModal] = useState(false);
  const [cloudLoadLoading, setCloudLoadLoading] = useState(false);
  const [cloudLoadGroups, setCloudLoadGroups] = useState<Record<string, CloudModalItem[]>>({});
  const [cloudLoadChecked, setCloudLoadChecked] = useState<Set<string>>(new Set());
  const [cloudLoadCollapsed, setCloudLoadCollapsed] = useState<Set<string>>(new Set());
  // Scenes tab — default to scenes (the primary import path)
  const [cloudLoadTab, setCloudLoadTab] = useState<'clouds' | 'scenes'>('scenes');
  const [scenesList, setScenesList] = useState<SceneListItem[]>([]);
  const [scenesListLoading, setScenesListLoading] = useState(false);
  const [selectedSceneForLoad, setSelectedSceneForLoad] = useState<string | null>(null);
  const [sceneLoadLoading, setSceneLoadLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // Scene checklist state (two-step import: pick scene → review checklist → load)
  const [sceneChecklistItems, setSceneChecklistItems] = useState<CloudModalItem[]>([]);
  const [sceneChecklistChecked, setSceneChecklistChecked] = useState<Set<string>>(new Set());
  const [sceneChecklistForScene, setSceneChecklistForScene] = useState<{id: string, title: string} | null>(null);

  // ── Build Graph modal (pre-build scene selector) ───────────────────────────
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [buildScenesList, setBuildScenesList] = useState<SceneListItem[]>([]);
  const [buildScenesChecked, setBuildScenesChecked] = useState<Set<string>>(new Set());
  const [loadingBuildScenes, setLoadingBuildScenes] = useState(false);

  // ── History (undo / redo, max 10 steps) ────────────────────────────────────
  const MAX_HISTORY = 10;
  const undoStack = useRef<HistorySnap[]>([]);
  const redoStack = useRef<HistorySnap[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Stable refs so history restore can attach current handlers without stale closure
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // Forward refs for node handlers (needed by hydrateNode without circular deps)
  const onTitleChangeRef = useRef<(id: string, v: string) => void>(() => {});
  const onContentChangeRef = useRef<(id: string, v: string) => void>(() => {});
  const onZoomToParentRef = useRef<(id: string) => void>(() => {});
  const onStateColorChangeRef = useRef<(id: string, c: string) => void>(() => {});
  const onImageGeneratedRef = useRef<(id: string, url: string) => void>(() => {});
  const onDeleteNodeRef = useRef<(id: string) => void>(() => {});
  const draftIdRef = useRef<string | null>(null);
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // Hydrate a stored node back into a live node with current handlers
  const hydrateNode = useCallback((sn: HistoryNode): Node => {
    const config = NODE_TYPE_MAP[sn.type || ''];
    return {
      id: sn.id,
      type: sn.type,
      position: { ...sn.position },
      width: sn.width,
      height: sn.height,
      dragging: false,
      selected: false,
      data: {
        ...sn.data,
        label: config?.label || sn.data.label,
        emoji: config?.emoji || sn.data.emoji,
        color: config?.color || sn.data.color,
        graphId: draftIdRef.current,
        onTitleChange: onTitleChangeRef.current,
        onContentChange: onContentChangeRef.current,
        onZoomToParent: onZoomToParentRef.current,
        onStateColorChange: onStateColorChangeRef.current,
        onImageGenerated: onImageGeneratedRef.current,
        onDelete: onDeleteNodeRef.current,
      },
    };
  }, []);

  // Capture current state into undo stack before an action
  const captureBeforeAction = useCallback(() => {
    const snap: HistorySnap = {
      nodes: nodesRef.current.map(snapshotNode),
      edges: edgesRef.current.map(e => ({ ...e })),
    };
    undoStack.current.push(snap);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    const current: HistorySnap = {
      nodes: nodesRef.current.map(snapshotNode),
      edges: edgesRef.current.map(e => ({ ...e })),
    };
    redoStack.current.push(current);
    const snap = undoStack.current.pop()!;
    setNodes(snap.nodes.map(hydrateNode));
    setEdges(snap.edges.map(e => ({ ...e })));
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, [setNodes, setEdges, hydrateNode]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    const current: HistorySnap = {
      nodes: nodesRef.current.map(snapshotNode),
      edges: edgesRef.current.map(e => ({ ...e })),
    };
    undoStack.current.push(current);
    const snap = redoStack.current.pop()!;
    setNodes(snap.nodes.map(hydrateNode));
    setEdges(snap.edges.map(e => ({ ...e })));
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, [setNodes, setEdges, hydrateNode]);

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const inInput =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable);
      if (inInput) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ── Scene mode ──────────────────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const sceneId = searchParams.get('scene') || null;
  const sceneNameParam = searchParams.get('sceneName') || null;
  const [sceneName, setSceneName] = useState<string | null>(sceneNameParam);
  const sceneLoaded = useRef(false);
  const pendingSyncRef = useRef<Record<string, { title?: string; content?: string }>>({});
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // ── Node handlers ───────────────────────────────────────────────────────────
  const handleImageGenerated = useCallback(
    (nodeId: string, url: string) => {
      setNodes(nds =>
        nds.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, generatedImage: url } } : n
        )
      );
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      captureBeforeAction();
      setNodes(nds => nds.filter(n => n.id !== nodeId));
      setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    },
    [setNodes, setEdges, selectedNodeId, captureBeforeAction]
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ids = new Set(deleted.map(n => n.id));
      setEdges(eds => eds.filter(e => !ids.has(e.source) && !ids.has(e.target)));
      setSelectedNodeId(prev => (prev && ids.has(prev) ? null : prev));
    },
    [setEdges]
  );

  const [selectedCount, setSelectedCount] = useState(0);
  const onSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedCount(sel.length);
    },
    []
  );

  const handleDeleteSelected = useCallback(() => {
    const selected = reactFlowInstance.getNodes().filter(n => n.selected);
    if (selected.length === 0) return;
    captureBeforeAction();
    const ids = new Set(selected.map(n => n.id));
    setNodes(nds => nds.filter(n => !ids.has(n.id)));
    setEdges(eds => eds.filter(e => !ids.has(e.source) && !ids.has(e.target)));
    setSelectedNodeId(prev => (prev && ids.has(prev) ? null : prev));
    setSelectedCount(0);
  }, [reactFlowInstance, setNodes, setEdges, captureBeforeAction]);

  const handleClearCanvas = useCallback(() => {
    captureBeforeAction();
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSelectedCount(0);
    setShowClearConfirm(false);
    showToast('Canvas cleared — Ctrl+Z to undo');
  }, [captureBeforeAction, setNodes, setEdges, showToast]);

  // Sync ref — filled later, called by title/content change handlers
  const scheduleSyncRef = useRef<(nodeId: string, field: 'title' | 'content', value: string) => void>(() => {});

  const handleTitleChange = useCallback(
    (nodeId: string, newTitle: string) => {
      setNodes(nds =>
        nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, title: newTitle } } : n))
      );
      scheduleSyncRef.current(nodeId, 'title', newTitle);
    },
    [setNodes]
  );

  const handleContentChange = useCallback(
    (nodeId: string, newContent: string) => {
      setNodes(nds =>
        nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, content: newContent } } : n))
      );
      scheduleSyncRef.current(nodeId, 'content', newContent);
    },
    [setNodes]
  );

  // Wire up forward refs for stable handler references in hydrateNode
  useEffect(() => {
    onTitleChangeRef.current = handleTitleChange;
    onContentChangeRef.current = handleContentChange;
    onDeleteNodeRef.current = handleDeleteNode;
    onImageGeneratedRef.current = handleImageGenerated;
  }, [handleTitleChange, handleContentChange, handleDeleteNode, handleImageGenerated]);

  const onZoomToParent = useCallback(
    (parentNodeId: string) => {
      const node = reactFlowInstance.getNodes().find((n: Node) => n.id === parentNodeId);
      if (!node) return;
      reactFlowInstance.fitView({ nodes: [node], duration: 500, padding: 0.3 });
    },
    [reactFlowInstance]
  );
  useEffect(() => { onZoomToParentRef.current = onZoomToParent; }, [onZoomToParent]);

  const handleStateColorChange = useCallback(
    (nodeId: string, color: string) => {
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
    },
    [setNodes, setEdges]
  );
  useEffect(() => { onStateColorChangeRef.current = handleStateColorChange; }, [handleStateColorChange]);

  const handlePanelUpdate = useCallback(
    (nodeId: string, field: string, value: unknown) => {
      setNodes(nds =>
        nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, [field]: value } } : n))
      );
    },
    [setNodes]
  );

  // Prevent refocus-click from closing the node panel when Alt+Tabbing back
  useEffect(() => {
    const handleFocus = () => {
      windowJustFocused.current = true;
      setTimeout(() => {
        windowJustFocused.current = false;
      }, 300);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => {
    if (windowJustFocused.current) return;
    setSelectedNodeId(null);
  }, []);

  const handleParentChange = useCallback(
    (nodeId: string, parentNodeId: string, parentLabel: string) => {
      setNodes(nds =>
        nds.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, parentNodeId, parentLabel } } : n
        )
      );
    },
    [setNodes]
  );

  const bigNodes = useMemo(
    () =>
      nodes
        .filter(n => n.type === 'character' || n.type === 'scene')
        .map(n => ({ id: n.id, label: (n.data.title as string) || n.type || 'unnamed' })),
    [nodes]
  );

  // ── makeNode: create a fully-hydrated node ─────────────────────────────────
  const makeNode = useCallback(
    (
      id: string,
      type: string,
      position: { x: number; y: number },
      data: Record<string, unknown> = {}
    ): Node => {
      const config = NODE_TYPE_MAP[type];
      return {
        id,
        type,
        position,
        dragging: false,
        selected: false,
        data: {
          type,
          label: config?.label || type,
          emoji: config?.emoji || '',
          color: config?.color || '#4A90D9',
          title: data.title || '',
          content: data.content || '',
          isProxy: data.isProxy || config?.isProxy || false,
          isContainer: data.isContainer || config?.isContainer || false,
          stateColor: data.stateColor || null,
          parentNodeId: data.parentNodeId || '',
          parentLabel: data.parentLabel || '',
          graphId: draftIdRef.current,
          onTitleChange: onTitleChangeRef.current,
          onContentChange: onContentChangeRef.current,
          onZoomToParent: onZoomToParentRef.current,
          onStateColorChange: onStateColorChangeRef.current,
          onImageGenerated: onImageGeneratedRef.current,
          onDelete: onDeleteNodeRef.current,
          // pass through any extra fields (generatedImage, etc.)
          ...Object.fromEntries(
            Object.entries(data).filter(
              ([k]) =>
                !['title','content','isProxy','isContainer','stateColor','parentNodeId','parentLabel'].includes(k)
            )
          ),
        },
      };
    },
    []
  );

  // ── addNode ─────────────────────────────────────────────────────────────────
  const addNode = useCallback(
    (config: NodeTypeConfig) => {
      nodeCounter.current += 1;
      const id = `node_${nodeCounter.current}_${Date.now()}`;
      const centerPos = (() => {
        try {
          const el = document.querySelector('.react-flow') as HTMLElement | null;
          const w = el?.clientWidth ?? 800;
          const h = el?.clientHeight ?? 600;
          return reactFlowInstance.screenToFlowPosition({ x: w / 2, y: h / 2 });
        } catch {
          return { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 };
        }
      })();
      captureBeforeAction();
      const newNode = makeNode(id, config.type, {
        x: centerPos.x + (Math.random() - 0.5) * 120,
        y: centerPos.y + (Math.random() - 0.5) * 80,
      }, { isProxy: config.isProxy || false, isContainer: config.isContainer || false });
      setNodes(nds => [...nds, newNode]);
    },
    [makeNode, setNodes, reactFlowInstance, captureBeforeAction]
  );

  // ── loadCloudNodesToCanvas ──────────────────────────────────────────────────
  // hubTitle: if provided, creates a chapterAct hub node and connects every item to it.
  // Scene loads (hubTitle set) REPLACE the canvas so items land in the column layout
  // and aren't hidden behind stale scattered positions from a prior load.
  const loadCloudNodesToCanvas = useCallback(
    (
      cloudNodes: Array<{ id: string; type: string; title: string; content: string; position: { x: number; y: number } }>,
      hubTitle?: string
    ) => {
      if (!cloudNodes.length) { showToast('No items to load'); return; }
      captureBeforeAction();

      const newNodes: Node[] = cloudNodes.map(cn =>
        makeNode(cn.id, cn.type, cn.position, { title: cn.title, content: cn.content })
      );

      let hubNode: Node | null = null;
      let hubId = '';

      if (hubTitle) {
        hubId = `hub_${Date.now()}`;
        // Centre the hub above all items (use the mid-point of the column span)
        const xs = newNodes.map(n => n.position.x);
        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
        const minY = Math.min(...newNodes.map(n => n.position.y));
        hubNode = makeNode(hubId, 'chapterAct', { x: centerX - 60, y: minY - 240 }, { title: hubTitle });
      }

      const allNodes = [...newNodes, ...(hubNode ? [hubNode] : [])];

      if (hubTitle) {
        // Scene load: replace canvas with just these nodes (clean layout, no stale positions)
        setNodes(allNodes);
        setEdges([]);
      } else {
        // Cloud type load: merge into existing canvas
        setNodes(nds => {
          const existingIds = new Set(nds.map(n => n.id));
          return [...nds, ...allNodes.filter(n => !existingIds.has(n.id))];
        });
      }

      if (hubTitle && hubId) {
        // Defer edge creation so React Flow has time to commit nodes first.
        // sourceHandle must be 'hub_source' — chapterAct only has named handles;
        // without a sourceHandle, React Flow can't find a default source and drops the edge.
        const edgesToAdd: Edge[] = newNodes.map((n, i) => ({
          id: `e_hub_${hubId}_${i}`,
          source: hubId,
          target: n.id,
          sourceHandle: 'hub_source',
          animated: true,
          style: { stroke: '#ec4899', strokeWidth: 2, strokeDasharray: '6 3' },
        }));
        setTimeout(() => {
          setEdges(edgesToAdd);
          setTimeout(() => reactFlowInstance.fitView({ duration: 600, padding: 0.18 }), 100);
        }, 80);
      }

      showToast(`${newNodes.length} item${newNodes.length !== 1 ? 's' : ''} loaded${hubTitle ? ' for scene' : ' from Cloud'}`);
      if (!hubTitle) {
        setTimeout(() => reactFlowInstance.fitView({ duration: 500, padding: 0.15 }), 800);
      }
    },
    [makeNode, setNodes, setEdges, showToast, reactFlowInstance, captureBeforeAction]
  );

  // ── Cloud API URL ───────────────────────────────────────────────────────────
  const cloudItemsUrl = useMemo(() => {
    const base = '/api/v1/cloud-items/to-nodes';
    return activeProjectId ? `${base}?project_id=${activeProjectId}` : base;
  }, [activeProjectId]);

  // ── Open cloud load modal ───────────────────────────────────────────────────
  // Default tab: scenes (primary import path). Cloud items loaded lazily when tab is opened.
  const openCloudLoadModal = useCallback(async () => {
    setShowCloudLoadModal(true);
    setCloudLoadTab('scenes');
    setSelectedSceneForLoad(null);
    setCloudLoadGroups({});
    setCloudLoadChecked(new Set());
    setSceneChecklistForScene(null);
    setSceneChecklistItems([]);
    setSceneChecklistChecked(new Set());
    // Immediately load scenes list
    setScenesListLoading(true);
    try {
      const res = await fetch('/api/v1/arc-scenes');
      const data = await res.json();
      setScenesList(data.scenes || []);
    } catch { /* ignore */ }
    setScenesListLoading(false);
  }, []);

  // ── Scenes tab: fetch scenes list ──────────────────────────────────────────
  const fetchScenesForModal = useCallback(async () => {
    setScenesListLoading(true);
    try {
      // Arc scaffold is global — no project filter (NULL project_id scenes must always appear)
      const res = await fetch('/api/v1/arc-scenes');
      const data = await res.json();
      setScenesList(data.scenes || []);
    } catch { /* ignore */ }
    setScenesListLoading(false);
  }, []);

  const handleSwitchToScenesTab = useCallback(() => {
    setCloudLoadTab('scenes');
    setSelectedSceneForLoad(null);
    setSceneChecklistForScene(null);
    setSceneChecklistItems([]);
    setSceneChecklistChecked(new Set());
    fetchScenesForModal();
  }, [fetchScenesForModal]);

  // Lazy-load cloud items when user switches to "By Cloud Type" tab
  const handleSwitchToCloudsTab = useCallback(async () => {
    setCloudLoadTab('clouds');
    if (Object.keys(cloudLoadGroups).length > 0) return; // already loaded
    setCloudLoadLoading(true);
    try {
      const res = await fetch(cloudItemsUrl);
      const data = await res.json();
      const allNodes: CloudModalItem[] = data.nodes || [];
      const groups: Record<string, CloudModalItem[]> = {};
      for (const n of allNodes) {
        const ct = n.cloud_type || 'other';
        if (!groups[ct]) groups[ct] = [];
        groups[ct].push(n);
      }
      setCloudLoadGroups(groups);
      setCloudLoadChecked(new Set(allNodes.map(n => n.id)));
      setCloudLoadCollapsed(new Set());
    } catch {
      showToast('Failed to fetch cloud items');
    } finally {
      setCloudLoadLoading(false);
    }
  }, [cloudItemsUrl, cloudLoadGroups, showToast]);

  // ── Load all cloud items as a fallback (called from the "load all anyway" button) ──
  // ── Scenes tab: select a scene → fetch its items ───────────────────────────
  // One-click: loads scene-specific items if attached, otherwise auto-falls back to all
  // cloud items. "Attach Items" in Arc Cloud is optional — for curating a specific scene view.
  const handleClickScene = useCallback(async (sId: string, sceneTitle: string) => {
    setSelectedSceneForLoad(sId);
    setSceneLoadLoading(true);

    try {
      type ItemShape = { id: string; cloud_type: string; title: string; content: string };

      // 1. Try scene-specific attached items (curated fast-path)
      const res = await fetch(`/api/v1/arc-scenes/${sId}/items`);
      const data = await res.json();
      const attachedItems: ItemShape[] = data.items || [];

      if (attachedItems.length > 0) {
        // Fast-path: scene HAS explicit attachments — load immediately
        const byType = new Map<string, ItemShape[]>();
        for (const item of attachedItems) {
          const list = byType.get(item.cloud_type) || [];
          list.push(item);
          byType.set(item.cloud_type, list);
        }
        const cloudNodes: Array<{ id: string; type: string; title: string; content: string; position: { x: number; y: number } }> = [];
        let colIndex = 0;
        for (const [, typeItems] of byType) {
          const x = colIndex * 380 + 80;
          typeItems.forEach((item, rowIndex) => {
            cloudNodes.push({
              id: `cloud_${item.id}`,
              type: mapCloudType(item.cloud_type, {}),
              title: item.title,
              content: item.content,
              position: { x, y: rowIndex * 220 + 80 },
            });
          });
          colIndex++;
        }
        setShowCloudLoadModal(false);
        loadCloudNodesToCanvas(cloudNodes, sceneTitle);
        setSceneLoadLoading(false);
        return;
      }

      // 2. No attachments → fetch all cloud items and show checklist for review
      const fallbackRes = await fetch(cloudItemsUrl);
      const fallbackData = await fallbackRes.json();
      // Exclude arc items — they are scaffold hubs, not content. If included they'd
      // render as a second chapterAct node and create confusing "References inlet" edges.
      const allNodes: CloudModalItem[] = (fallbackData.nodes || [])
        .filter((n: CloudModalItem) => n.cloud_type !== 'arc')
        .map((n: CloudModalItem) => ({
          id: n.id,
          type: n.type,
          cloud_type: n.cloud_type,
          title: n.title,
          content: n.content || '',
          position: n.position,
        }));

      if (!allNodes.length) {
        showToast('No cloud items found — add items to your Clouds first');
        setSceneLoadLoading(false);
        return;
      }

      // Find scene content for keyword matching
      const sceneInfo = scenesList.find(s => s.id === sId);
      const sceneContent = sceneInfo?.content || '';

      // Show checklist with smart pre-selection
      setSceneChecklistItems(allNodes);
      setSceneChecklistChecked(smartPreselect(allNodes, sceneTitle, sceneContent));
      setSceneChecklistForScene({ id: sId, title: sceneTitle });
    } catch {
      showToast('Failed to load scene');
    }
    setSceneLoadLoading(false);
  }, [cloudItemsUrl, loadCloudNodesToCanvas, showToast, scenesList]);

  // ── Confirm load — only used by "By Cloud Type" tab now ──────────────────────
  const handleCloudLoadConfirm = useCallback(() => {
    const allItems = Object.values(cloudLoadGroups).flat();
    const selected = allItems.filter(item => cloudLoadChecked.has(item.id));
    loadCloudNodesToCanvas(selected);
    setShowCloudLoadModal(false);
  }, [cloudLoadGroups, cloudLoadChecked, loadCloudNodesToCanvas]);

  // ── Scene checklist confirm — build layout from checked items, load + close ──
  const handleSceneChecklistConfirm = useCallback(() => {
    if (!sceneChecklistForScene || sceneChecklistChecked.size === 0) return;
    // Always exclude arc items — they're scaffold hubs, not visual nodes
    const selected = sceneChecklistItems.filter(i => sceneChecklistChecked.has(i.id) && i.cloud_type !== 'arc');

    // Build column layout by cloud_type
    const byType = new Map<string, CloudModalItem[]>();
    for (const item of selected) {
      const list = byType.get(item.cloud_type) || [];
      list.push(item);
      byType.set(item.cloud_type, list);
    }
    const cloudNodes: Array<{ id: string; type: string; title: string; content: string; position: { x: number; y: number } }> = [];
    let colIndex = 0;
    for (const [, typeItems] of byType) {
      const x = colIndex * 380 + 80;
      typeItems.forEach((item, rowIndex) => {
        cloudNodes.push({
          id: item.id.startsWith('cloud_') ? item.id : `cloud_${item.id}`,
          type: item.type,
          title: item.title,
          content: item.content,
          position: { x, y: rowIndex * 220 + 80 },
        });
      });
      colIndex++;
    }

    loadCloudNodesToCanvas(cloudNodes, sceneChecklistForScene.title);
    setShowCloudLoadModal(false);
    setSceneChecklistForScene(null);
    setSceneChecklistItems([]);
    setSceneChecklistChecked(new Set());
  }, [sceneChecklistForScene, sceneChecklistChecked, sceneChecklistItems, loadCloudNodesToCanvas]);

  // ── Load scene items (scene mode — auto on entry) ──────────────────────────
  const loadSceneItems = useCallback(async () => {
    if (!sceneId) return;
    setImportingCloud(true);
    try {
      const res = await fetch(`/api/v1/arc-scenes/${sceneId}/items`);
      const data = await res.json();
      const items: SceneItem[] = data.items || [];

      if (!items.length) {
        showToast('No items attached to this scene — attach items in Arc Cloud first');
        setImportingCloud(false);
        return;
      }

      // Layout: group by cloud_type, arrange in columns
      const byType = new Map<string, SceneItem[]>();
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
          const meta = typeof item.metadata === 'string'
            ? JSON.parse(item.metadata || '{}')
            : (item.metadata || {});
          newNodes.push(
            makeNode(`cloud_${item.id}`, mapCloudType(item.cloud_type, meta),
              { x, y: 80 + rowIndex * 220 },
              { title: item.title, content: item.content || '' })
          );
        });
        colIndex++;
      }

      // Hub node at top center, edges from hub to every item
      const xs = newNodes.map(n => n.position.x);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const hubId = `scene_hub_${sceneId}`;
      const hub = makeNode(hubId, 'chapterAct', { x: centerX - 60, y: -200 },
        { title: sceneName || 'Scene' });

      const allNodes = [hub, ...newNodes];
      setNodes(allNodes);
      // Defer edge creation — chapterAct only has named handles; sourceHandle must be
      // 'hub_source' (the bottom-center handle added to HubNode for programmatic connections)
      const hubEdges: Edge[] = newNodes.map((n, i) => ({
        id: `e_hub_${n.id}_${i}`,
        source: hubId,
        target: n.id,
        sourceHandle: 'hub_source',
        animated: true,
        style: { stroke: '#ec4899', strokeWidth: 2, strokeDasharray: '6 3' },
      }));
      setTimeout(() => setEdges(hubEdges), 80);

      // Initialise history with this state so first undo goes back to empty
      undoStack.current = [];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);

      showToast(`${newNodes.length} item${newNodes.length !== 1 ? 's' : ''} loaded for scene`);
      setTimeout(() => reactFlowInstance.fitView({ duration: 600, padding: 0.18 }), 300);
    } catch {
      showToast('Failed to load scene items');
    } finally {
      setImportingCloud(false);
    }
  }, [sceneId, sceneName, makeNode, setNodes, setEdges, showToast, reactFlowInstance]);

  // Auto-load scene items on mount
  useEffect(() => {
    if (sceneId && !sceneLoaded.current && nodes.length === 0) {
      sceneLoaded.current = true;
      loadSceneItems();
    }
  }, [sceneId, nodes.length, loadSceneItems]);

  // Fetch scene name if not in query params
  useEffect(() => {
    if (sceneId && !sceneName) {
      fetch(`/api/v1/arc-scenes/${sceneId}/scene-info`)
        .then(r => r.json())
        .then(d => { if (d.title) setSceneName(d.title); })
        .catch(() => {});
    }
  }, [sceneId, sceneName]);

  // ── Cloud sync: debounced PATCH back to cloud_items ─────────────────────────
  // Works for ANY cloud_ prefixed node in ANY mode (scene or standalone).
  const flushSync = useCallback((): number => {
    const pending = { ...pendingSyncRef.current };
    pendingSyncRef.current = {};
    const entries = Object.entries(pending);
    if (!entries.length) return 0;
    Promise.all(
      entries.map(([itemId, changes]) =>
        fetch(`/api/v1/cloud-items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        })
      )
    ).catch(() => showToast('Some cloud syncs failed'));
    return entries.length;
  }, [showToast]);

  const scheduleSyncForNode = useCallback(
    (nodeId: string, field: 'title' | 'content', value: string) => {
      if (!nodeId.startsWith('cloud_')) return;
      const itemId = nodeId.replace('cloud_', '');
      pendingSyncRef.current[itemId] = {
        ...pendingSyncRef.current[itemId],
        [field]: value,
      };
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(flushSync, 1000);
    },
    [flushSync]
  );

  // Always wire up cloud sync (not just in scene mode)
  scheduleSyncRef.current = scheduleSyncForNode;

  // ── Connect edges ───────────────────────────────────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      captureBeforeAction();
      setEdges(eds =>
        addEdge(
          { ...connection, animated: true, style: { stroke: '#c4c8d0', strokeDasharray: '5 5' } },
          eds
        )
      );
      // State → Proxy recolor
      setNodes(nds => {
        const src = nds.find(n => n.id === connection.source);
        const tgt = nds.find(n => n.id === connection.target);
        if (src && tgt && src.data.type === 'state' && tgt.data.isProxy && src.data.stateColor) {
          return nds.map(n =>
            n.id === connection.target
              ? { ...n, data: { ...n.data, stateColor: src.data.stateColor } }
              : n
          );
        }
        return nds;
      });
    },
    [setEdges, setNodes, captureBeforeAction]
  );

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => connection.source !== connection.target,
    []
  );

  // ── Serialise nodes for draft save (strips function refs) ───────────────────
  const cleanNodesForSave = useCallback((nodesToClean: Node[]) => {
    return nodesToClean.map(n => {
      const clean: Record<string, unknown> = {
        type: n.data.type, label: n.data.label, emoji: n.data.emoji, color: n.data.color,
        title: n.data.title, content: n.data.content,
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
      if (n.data.events) clean.events = n.data.events;
      if (n.data.description) clean.description = n.data.description;
      if (n.data.trigger) clean.trigger = n.data.trigger;
      if (n.data.rootCause) clean.rootCause = n.data.rootCause;
      if (n.data.duration) clean.duration = n.data.duration;
      if (n.data.resolution) clean.resolution = n.data.resolution;
      if (n.data.model) clean.model = n.data.model;
      if (n.data.apiKey) clean.apiKey = n.data.apiKey;
      if (n.data.systemPrompt) clean.systemPrompt = n.data.systemPrompt;
      if (n.data.temperature !== undefined) clean.temperature = n.data.temperature;
      if (n.data.instructions) clean.instructions = n.data.instructions;
      return { ...n, data: clean };
    });
  }, []);

  // ── Save: flush cloud sync first, then persist draft ───────────────────────
  const save = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    const synced = flushSync();
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
      if (!res.ok) { showToast(data.error || 'Save failed'); return; }
      if (!draftId && data.draft?.id) setDraftId(data.draft.id);
      showToast(
        synced > 0
          ? `Saved! (${synced} cloud item${synced > 1 ? 's' : ''} synced)`
          : 'Saved!'
      );
    } catch {
      showToast('Save failed');
    }
    setSaving(false);
  }, [session, draftId, title, nodes, edges, showToast, cleanNodesForSave, flushSync]);

  // ── Publish ─────────────────────────────────────────────────────────────────
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
      if (!res.ok) showToast(data.error || 'Publish failed');
      else showToast(`Published! ${data.published?.url || ''}`);
    } catch { showToast('Publish failed'); }
    setPublishing(false);
  }, [session, draftId, title, save, showToast]);

  // ── Copy for AI ─────────────────────────────────────────────────────────────
  const copyForAI = useCallback(() => {
    const text = serializeGraphForAI(title, nodes, edges);
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
  }, [title, nodes, edges, showToast]);

  // ── Open Build Graph modal ───────────────────────────────────────────────────
  const openBuildModal = useCallback(async () => {
    setShowBuildModal(true);
    setLoadingBuildScenes(true);
    try {
      const res = await fetch('/api/v1/arc-scenes');
      const data = await res.json() as { scenes?: SceneListItem[] };
      const scenes = data.scenes || [];
      setBuildScenesList(scenes);
      setBuildScenesChecked(new Set(scenes.map(s => s.id)));
    } catch {
      setBuildScenesList([]);
    }
    setLoadingBuildScenes(false);
  }, []);

  // ── Auto-Build Graph ─────────────────────────────────────────────────────────
  // Calls /api/v1/graph-build, receives nodes+edges built by AI from cloud items,
  // then replaces the canvas with the generated graph.
  const handleAutoBuild = useCallback(async (sceneIds?: string[]) => {
    setShowBuildModal(false);
    setAutoBuilding(true);
    try {
      const params: Record<string, unknown> = {};
      if (activeProjectId) params.project_id = activeProjectId;
      if (sceneIds?.length) params.scene_ids = sceneIds;

      const res = await fetch('/api/v1/graph-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json() as {
        nodes?: BuildNode[];
        edges?: BuildEdge[];
        meta?: { itemsUsed: number; nodesGenerated: number; edgesGenerated: number };
        error?: string;
      };

      if (!res.ok || data.error) {
        showToast(data.error || 'Auto-build failed');
        return;
      }

      const incomingNodes = data.nodes || [];
      const incomingEdges = data.edges || [];

      if (!incomingNodes.length) {
        const rawCount = (data.nodes as unknown[])?.length ?? 0;
        showToast(rawCount > 0
          ? `AI returned ${rawCount} nodes but all had invalid types — check console`
          : 'AI returned an empty graph. Add items to your clouds first.'
        );
        console.warn('[graph-build] raw:', data);
        return;
      }

      // Snapshot for undo, then replace canvas
      captureBeforeAction();
      setNodes(incomingNodes.map(n => ({
        ...n,
        data: { ...n.data, label: n.data.title, color: NODE_TYPE_MAP[n.type]?.color || '#4A90D9' },
      })));
      setEdges([]);
      setTimeout(() => setEdges(incomingEdges), 80);
      // Fit view after nodes + edges are committed
      setTimeout(() => reactFlowInstance.fitView({ duration: 600, padding: 0.15 }), 200);

      showToast(
        `✨ Graph built: ${incomingNodes.length} nodes, ${incomingEdges.length} edges${data.meta ? ` from ${data.meta.itemsUsed} cloud items` : ''}`
      );
    } catch (err) {
      showToast(`Auto-build error: ${err}`);
    } finally {
      setAutoBuilding(false);
    }
  }, [activeProjectId, showToast, captureBeforeAction, setNodes, setEdges]);

  // ── File import ─────────────────────────────────────────────────────────────
  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Import failed');
      } else if (data.saved > 0) {
        showToast(`✅ ${data.saved} items saved to your clouds — click Load from Cloud to view them`);
      } else {
        showToast('⚠️ No items could be extracted from the file. Try a richer document.');
      }
    } catch { showToast('Import failed'); }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [showToast]);

  // ── Categorised node types for sidebar ─────────────────────────────────────
  // Only show non-hidden node types in the palette, grouped by new sections
  const categorized = useMemo(() => {
    const visible = NODE_TYPES.filter(n => !n.hidden);
    return {
      story:     visible.filter(n => n.category === 'content'),
      character: visible.filter(n => n.category === 'proxy' || n.category === 'meta'),
      reference: visible.filter(n => n.category === 'reference'),
    };
  }, []);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted">
        Please sign in to use the visual editor.
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────────
  const CLOUD_TYPE_LABELS: Record<string, string> = {
    characters: 'Characters', scenes: 'Stage', world: 'World',
    ideas: 'Ideas', references: 'References', arc: 'Arc',
  };
  const CLOUD_TYPE_EMOJI: Record<string, string> = {
    characters: '👤', scenes: '🎬', world: '🌍', ideas: '💡', references: '📑', arc: '📈',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Standalone mode banner */}
      {!sceneId && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 shrink-0">
          <span>Visual Editor — standalone mode</span>
          <a href="/workspace/arc-cloud" className="text-accent hover:underline">
            Go to Arc Cloud →
          </a>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Node type sidebar */}
        {sidebarOpen && (
          <div
            className="w-56 bg-white border-r border-gray-200 overflow-y-auto shrink-0"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="p-3">
              <div className="mb-3">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-gray-50 text-gray-800 text-sm font-medium rounded px-2 py-1.5 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-200"
                  placeholder="Graph title..."
                />
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-400 mb-3 font-medium">Add Node</div>

              {/* Story nodes */}
              {categorized.story.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-blue-600 font-semibold mb-2 uppercase tracking-wide">Story</div>
                  <div className="space-y-0.5">
                    {categorized.story.map(nt => (
                      <button key={nt.type} onClick={() => addNode(nt)}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700">
                        <span>{nt.emoji}</span><span>{nt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Character pattern nodes */}
              {categorized.character.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-violet-600 font-semibold mb-2 uppercase tracking-wide">Character</div>
                  <div className="space-y-0.5">
                    {categorized.character.map(nt => (
                      <button key={nt.type} onClick={() => addNode(nt)}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700">
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
              {/* Reference nodes */}
              {categorized.reference.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-amber-600 font-semibold mb-2 uppercase tracking-wide">References</div>
                  <div className="space-y-0.5">
                    {categorized.reference.map(nt => (
                      <button key={nt.type} onClick={() => addNode(nt)}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700">
                        <span>{nt.emoji}</span><span>{nt.label}</span>
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
              <Controls
                position="bottom-left"
                className="!bg-white !border-gray-200 !shadow-sm [&>button]:!bg-white [&>button]:!border-gray-200 [&>button]:!text-gray-600 [&>button:hover]:!bg-gray-50"
              />
              <MiniMap
                position="bottom-right"
                nodeColor={n => NODE_TYPE_MAP[n.type || '']?.color || '#6b7280'}
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
                      ← Back to Arc Cloud
                    </a>
                  </div>
                </Panel>
              )}

              {/* Top toolbar */}
              <Panel position="top-left" className="!m-3">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 flex items-center gap-1 flex-wrap">
                  {/* Sidebar toggle */}
                  <button
                    onClick={() => setSidebarOpen(s => !s)}
                    className="px-2 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Toggle node palette"
                  >
                    {sidebarOpen ? '◀' : '▶'} Nodes
                  </button>
                  <div className="w-px h-6 bg-gray-200 mx-1" />

                  {/* History: Undo / Redo */}
                  <button
                    onClick={undo}
                    disabled={!canUndo}
                    className="px-2 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Undo (Ctrl+Z)"
                  >
                    ↩ Undo
                  </button>
                  <button
                    onClick={redo}
                    disabled={!canRedo}
                    className="px-2 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Redo (Ctrl+Y)"
                  >
                    ↪ Redo
                  </button>
                  <div className="w-px h-6 bg-gray-200 mx-1" />

                  {/* Open draft */}
                  <button
                    onClick={() => setShowDraftBrowser(true)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Open existing draft"
                  >
                    Open
                  </button>
                  <div className="w-px h-6 bg-gray-200 mx-1" />

                  {/* Save (flushes cloud sync too) */}
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white transition-colors"
                    title="Save draft + sync changes to Clouds"
                  >
                    {saving ? 'Saving...' : '💾 Save'}
                  </button>
                  <button
                    onClick={publish}
                    disabled={publishing}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-white transition-colors"
                  >
                    {publishing ? 'Publishing...' : 'Publish'}
                  </button>

                  {/* Runway export */}
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
                    {exportingRunway ? 'Exporting...' : '🎬 Runway'}
                  </button>

                  {/* Delete selected */}
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

                  {/* Copy for AI */}
                  <button
                    onClick={copyForAI}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-indigo-600 hover:bg-gray-100 transition-colors"
                    title="Copy graph as text for AI"
                  >
                    📋 Copy for AI
                  </button>

                  {/* Load from Cloud — opens scene selector, then AI builds graph */}
                  <button
                    onClick={sceneId ? loadSceneItems : openBuildModal}
                    disabled={autoBuilding || importingCloud}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={sceneId ? 'Reload scene items' : 'Select scenes and build a connected graph with AI'}
                  >
                    {autoBuilding ? '⏳ Building...' : importingCloud ? '☁️ Loading...' : sceneId ? '☁️ Reload Scene' : '✨ Load from Cloud'}
                  </button>
                  <div className="w-px h-6 bg-gray-200 mx-1" />

                  {/* Upload file */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    title="Upload file (TXT, MD, DOCX)"
                  >
                    {importing ? 'Uploading...' : '📤 Upload File'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.docx,.pdf"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <div className="w-px h-6 bg-gray-200 mx-1" />

                  {/* Clear canvas */}
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Clear all nodes and edges from canvas"
                  >
                    🗑 Clear
                  </button>
                </div>
              </Panel>

              {/* Clear canvas confirmation modal */}
              {/* ── Build Graph modal — scene selector ───────────────────── */}
              {showBuildModal && (
                <Panel position="top-center" className="!mt-16 !z-50">
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-96">
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-gray-800">Build Graph from Cloud</p>
                      <p className="text-xs text-gray-500 mt-1">
                        AI reads your cloud items and builds a connected graph — scenes, characters with state nodes, world rules, references.
                      </p>
                    </div>

                    {loadingBuildScenes ? (
                      <div className="text-xs text-gray-400 py-4 text-center">Loading scenes...</div>
                    ) : buildScenesList.length === 0 ? (
                      <div className="text-xs text-gray-500 py-2 mb-4">
                        No arc scenes found — all cloud items will be used to build the graph.
                      </div>
                    ) : (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-gray-600">Arc scenes to include ({buildScenesChecked.size}/{buildScenesList.length})</p>
                          <button
                            onClick={() => setBuildScenesChecked(
                              buildScenesChecked.size === buildScenesList.length
                                ? new Set()
                                : new Set(buildScenesList.map(s => s.id))
                            )}
                            className="text-xs text-indigo-500 hover:text-indigo-700"
                          >
                            {buildScenesChecked.size === buildScenesList.length ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                        <div className="space-y-1 max-h-52 overflow-y-auto border border-gray-100 rounded-lg p-2">
                          {buildScenesList.map(scene => (
                            <label key={scene.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={buildScenesChecked.has(scene.id)}
                                onChange={() => setBuildScenesChecked(prev => {
                                  const next = new Set(prev);
                                  next.has(scene.id) ? next.delete(scene.id) : next.add(scene.id);
                                  return next;
                                })}
                                className="rounded border-gray-300"
                              />
                              <span className="text-xs text-gray-700 truncate">{scene.title}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowBuildModal(false)}
                        className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAutoBuild(
                          buildScenesList.length > 0
                            ? [...buildScenesChecked]
                            : undefined
                        )}
                        disabled={buildScenesList.length > 0 && buildScenesChecked.size === 0}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-40"
                      >
                        ✨ Build Graph
                      </button>
                    </div>
                  </div>
                </Panel>
              )}

              {showClearConfirm && (
                <Panel position="top-center" className="!mt-16 !z-50">
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-80">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl shrink-0">🗑</div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Clear canvas?</p>
                        <p className="text-xs text-gray-500 mt-0.5">All nodes and edges will be removed.</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mb-4 border-t border-gray-100 pt-3">
                      You can undo this with <kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">Ctrl+Z</kbd>
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleClearCanvas}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
                      >
                        Yes, clear
                      </button>
                    </div>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </GraphContext.Provider>
        </div>

        {/* Draft browser */}
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

        {/* Node editor panel */}
        <NodePanel
          node={nodes.find(n => n.id === selectedNodeId) || null}
          nodes={nodes}
          edges={edges}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={handlePanelUpdate}
          onDelete={handleDeleteNode}
        />

        {/* ── Cloud Load Modal ────────────────────────────────────────────────── */}
        {showCloudLoadModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowCloudLoadModal(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Load into Editor</h2>
                  {activeProjectId && (
                    <span className="text-xs text-gray-400">
                      Project: {projects.find(p => p.id === activeProjectId)?.title || 'Selected'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowCloudLoadModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100 px-6">
                {/* By Scene tab is FIRST — primary import path */}
                <button
                  onClick={handleSwitchToScenesTab}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${cloudLoadTab === 'scenes' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  🎬 By Scene
                  <span className="ml-1.5 text-xs text-gray-400">(auto-connects)</span>
                </button>
                <button
                  onClick={handleSwitchToCloudsTab}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${cloudLoadTab === 'clouds' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  ☁️ By Cloud Type
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">

                {/* ── Clouds tab ──────────────────────────────────────────────── */}
                {cloudLoadTab === 'clouds' && (
                  cloudLoadLoading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading items...
                    </div>
                  ) : Object.keys(cloudLoadGroups).length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      No cloud items found{activeProjectId ? ' for this project' : ''}.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(cloudLoadGroups).map(([cloudType, items]) => {
                        const label = CLOUD_TYPE_LABELS[cloudType] || cloudType;
                        const emoji = CLOUD_TYPE_EMOJI[cloudType] || '☁️';
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
                              <span className="text-xs text-gray-400">{isCollapsed ? '▶' : '▼'}</span>
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
                      })}
                    </div>
                  )
                )}

                {/* ── Scenes tab — one click to load ─────────────────────────── */}
                {cloudLoadTab === 'scenes' && (
                  <div className="space-y-1.5">

                    {/* Checklist view — shown after clicking a scene with no attachments */}
                    {sceneChecklistForScene ? (
                      <div className="space-y-2">
                        {/* Header */}
                        <div className="flex items-center gap-2 pb-1">
                          <button
                            onClick={() => { setSceneChecklistForScene(null); setSceneChecklistItems([]); setSceneChecklistChecked(new Set()); }}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            ← back
                          </button>
                          <span className="text-xs text-gray-500 font-medium truncate">
                            {sceneChecklistForScene.title.includes(' — ')
                              ? sceneChecklistForScene.title.slice(sceneChecklistForScene.title.indexOf(' — ') + 3)
                              : sceneChecklistForScene.title}
                          </span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {sceneChecklistChecked.size} selected
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 pb-1">
                          ✨ Smart pre-selection based on scene content. Uncheck what you don&apos;t need.
                        </p>
                        {/* Items grouped by cloud type */}
                        {(() => {
                          const groups = new Map<string, CloudModalItem[]>();
                          for (const item of sceneChecklistItems) {
                            const list = groups.get(item.cloud_type) || [];
                            list.push(item);
                            groups.set(item.cloud_type, list);
                          }
                          return [...groups.entries()].map(([cloudType, items]) => {
                            const label = CLOUD_TYPE_LABELS[cloudType] || cloudType;
                            const emoji = CLOUD_TYPE_EMOJI[cloudType] || '☁️';
                            const groupChecked = items.filter(i => sceneChecklistChecked.has(i.id)).length;
                            const allChecked = groupChecked === items.length;
                            return (
                              <div key={cloudType} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                                  <input
                                    type="checkbox"
                                    checked={allChecked}
                                    onChange={() => setSceneChecklistChecked(prev => {
                                      const next = new Set(prev);
                                      items.forEach(i => allChecked ? next.delete(i.id) : next.add(i.id));
                                      return next;
                                    })}
                                    className="rounded border-gray-300"
                                  />
                                  <span>{emoji}</span>
                                  <span className="text-sm font-medium text-gray-700">{label}</span>
                                  <span className="text-xs text-gray-400 ml-auto">{groupChecked}/{items.length}</span>
                                </div>
                                <div className="px-3 py-1 space-y-0.5 max-h-40 overflow-y-auto">
                                  {items.map(item => (
                                    <label key={item.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm">
                                      <input
                                        type="checkbox"
                                        checked={sceneChecklistChecked.has(item.id)}
                                        onChange={() => setSceneChecklistChecked(prev => {
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
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : scenesListLoading ? (
                      <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading scenes...
                      </div>
                    ) : scenesList.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        No scenes found. Add scenes in Arc Cloud first.
                      </div>
                    ) : (() => {
                        // Group scenes by arc prefix (part before " — "), or standalone if no prefix
                        const groups = new Map<string, typeof scenesList>();
                        for (const scene of scenesList) {
                          const sepIdx = scene.title.indexOf(' — ');
                          const groupKey = sepIdx >= 0 ? scene.title.slice(0, sepIdx) : '—';
                          const list = groups.get(groupKey) || [];
                          list.push(scene);
                          groups.set(groupKey, list);
                        }
                        return (
                          <div className="space-y-4">
                            <p className="text-xs text-gray-400">Click a scene to load it. Scenes with a pink badge load curated items only — all others load your full cloud.</p>
                            {[...groups.entries()].map(([groupKey, groupScenes]) => (
                              <div key={groupKey}>
                                {groupKey !== '—' && (
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 px-1">
                                    📖 {groupKey}
                                  </p>
                                )}
                                <div className="space-y-1.5">
                                  {groupScenes.map(scene => {
                                    const sepIdx = scene.title.indexOf(' — ');
                                    const displayTitle = sepIdx >= 0 ? scene.title.slice(sepIdx + 3) : scene.title;
                                    const isLoading = sceneLoadLoading && selectedSceneForLoad === scene.id;
                                    return (
                                      <button
                                        key={scene.id}
                                        onClick={() => handleClickScene(scene.id, scene.title)}
                                        disabled={isLoading}
                                        className={`w-full text-left px-4 py-2.5 rounded-xl border transition-all hover:border-pink-300 hover:bg-pink-50/40 ${
                                          isLoading ? 'border-pink-400 bg-pink-50 opacity-70' : 'border-gray-200'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <span className="font-medium text-gray-800 text-sm">{displayTitle}</span>
                                            {scene.content && (
                                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{scene.content}</p>
                                            )}
                                          </div>
                                          {isLoading ? (
                                            <svg className="animate-spin h-4 w-4 text-pink-500 shrink-0" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                          ) : scene.attached_count > 0 ? (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-600 font-medium shrink-0">
                                              {scene.attached_count}
                                            </span>
                                          ) : null}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    }
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setShowCloudLoadModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                {/* By Cloud Type tab */}
                {cloudLoadTab === 'clouds' && (
                  <button
                    onClick={handleCloudLoadConfirm}
                    disabled={cloudLoadChecked.size === 0}
                    className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Load {cloudLoadChecked.size} item{cloudLoadChecked.size !== 1 ? 's' : ''}
                  </button>
                )}
                {/* Scene checklist confirm */}
                {cloudLoadTab === 'scenes' && sceneChecklistForScene && (
                  <button
                    onClick={handleSceneChecklistConfirm}
                    disabled={sceneChecklistChecked.size === 0}
                    className="px-5 py-2 rounded-lg text-sm font-medium bg-pink-600 text-white hover:bg-pink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    🎬 Load {sceneChecklistChecked.size} item{sceneChecklistChecked.size !== 1 ? 's' : ''} + connect
                  </button>
                )}
              </div>
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
