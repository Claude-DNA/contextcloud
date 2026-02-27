'use client';

import { useCallback, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CloudNode from '@/components/nodes/CloudNode';
import LayerNode from '@/components/nodes/LayerNode';
import FlowNode from '@/components/nodes/FlowNode';
import ReferenceNode from '@/components/nodes/ReferenceNode';
import ConnectionNode from '@/components/nodes/ConnectionNode';
import NodeSidebar from '@/components/NodeSidebar';

const nodeTypes = {
  cloudNode: CloudNode,
  layerNode: LayerNode,
  flowNode: FlowNode,
  referenceNode: ReferenceNode,
  connectionNode: ConnectionNode,
};

const INITIAL_NODES: Node[] = [
  {
    id: '1',
    type: 'cloudNode',
    position: { x: 300, y: 50 },
    data: { label: 'My Context Cloud', description: 'A new context structure' },
  },
  {
    id: '2',
    type: 'layerNode',
    position: { x: 150, y: 220 },
    data: { label: 'Core Ideas', layerType: 'core', content: '' },
  },
  {
    id: '3',
    type: 'layerNode',
    position: { x: 450, y: 220 },
    data: { label: 'Cultural Context', layerType: 'cultural', content: '' },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e1-3', source: '1', target: '3', animated: true },
];

export default function VisualCanvas() {
  const { data: session } = useSession();
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const idCounter = useRef(4);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  function addNode(type: string) {
    const id = String(idCounter.current++);
    const defaults: Record<string, Record<string, unknown>> = {
      cloudNode: { label: 'New Cloud', description: '' },
      layerNode: { label: 'New Layer', layerType: 'context', content: '' },
      flowNode: { label: 'New Flow', description: '' },
      referenceNode: { label: 'New Reference', url: '' },
      connectionNode: { label: 'relates to', relationship: 'related' },
    };
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: defaults[type] || { label: 'Node' },
    };
    setNodes((nds) => [...nds, newNode]);
  }

  function updateNodeData(id: string, data: Record<string, unknown>) {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data } : n))
    );
    if (selectedNode?.id === id) {
      setSelectedNode((prev) => (prev ? { ...prev, data } : null));
    }
  }

  async function save() {
    if (!session) return;
    setSaving(true);
    setMessage(null);
    try {
      // Extract title from first cloud node
      const cloudNode = nodes.find((n) => n.type === 'cloudNode');
      const title = (cloudNode?.data as Record<string, unknown>)?.label as string || 'Untitled Canvas';
      const description = (cloudNode?.data as Record<string, unknown>)?.description as string || '';

      // Build layers from layer nodes
      const layers = nodes
        .filter((n) => n.type === 'layerNode')
        .map((n) => {
          const d = n.data as Record<string, unknown>;
          return {
            id: n.id,
            name: d.label as string || '',
            type: d.layerType as string || 'context',
            content: d.content as string || '',
          };
        });

      const method = draftId ? 'PUT' : 'POST';
      const body = {
        ...(draftId ? { id: draftId } : {}),
        title,
        description,
        type: 'cloud',
        layers,
        canvas: { nodes, edges },
      };

      const res = await fetch('/api/v1/drafts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Save failed' });
        return;
      }

      if (!draftId && data.draft?.id) {
        setDraftId(data.draft.id);
      }
      setMessage({ type: 'success', text: 'Canvas saved' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!session) return;
    setPublishing(true);
    setMessage(null);
    try {
      await save();

      const cloudNode = nodes.find((n) => n.type === 'cloudNode');
      const title = (cloudNode?.data as Record<string, unknown>)?.label as string || 'Untitled';
      const description = (cloudNode?.data as Record<string, unknown>)?.description as string || '';

      const layers = nodes
        .filter((n) => n.type === 'layerNode')
        .map((n) => {
          const d = n.data as Record<string, unknown>;
          return {
            name: d.label as string || '',
            type: d.layerType as string || 'context',
            content: d.content as string || '',
          };
        });

      const res = await fetch('/api/v1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, title, description, type: 'cloud', layers }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Publish failed' });
        return;
      }

      setMessage({
        type: 'success',
        text: `Published! View at ${data.published?.url || 'contextube.ai'}`,
      });
    } catch {
      setMessage({ type: 'error', text: 'Failed to publish' });
    } finally {
      setPublishing(false);
    }
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted">
        Please sign in to use the visual editor.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gray-50"
        >
          <Background gap={20} size={1} color="#e2e8f0" />
          <Controls className="!bg-white !border-border !shadow-sm" />
          <MiniMap
            className="!bg-white !border-border"
            nodeColor={(n) => {
              if (n.type === 'cloudNode') return '#6366f1';
              if (n.type === 'layerNode') return '#8b5cf6';
              if (n.type === 'flowNode') return '#10b981';
              if (n.type === 'referenceNode') return '#6b7280';
              if (n.type === 'connectionNode') return '#f97316';
              return '#94a3b8';
            }}
          />

          {/* Toolbar */}
          <Panel position="top-left" className="!m-3">
            <div className="bg-white rounded-xl border border-border shadow-sm p-2 flex items-center gap-1">
              <ToolbarButton label="Cloud" color="indigo" onClick={() => addNode('cloudNode')} />
              <ToolbarButton label="Layer" color="violet" onClick={() => addNode('layerNode')} />
              <ToolbarButton label="Flow" color="emerald" onClick={() => addNode('flowNode')} />
              <ToolbarButton label="Ref" color="gray" onClick={() => addNode('referenceNode')} />
              <ToolbarButton label="Link" color="orange" onClick={() => addNode('connectionNode')} />
              <div className="w-px h-6 bg-border mx-1" />
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={publish}
                disabled={publishing}
                className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </Panel>

          {/* Messages */}
          {message && (
            <Panel position="top-center" className="!m-3">
              <div
                className={`px-4 py-2 rounded-lg text-sm shadow-sm ${
                  message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {message.text}
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Properties panel */}
      {selectedNode && (
        <NodeSidebar
          node={selectedNode}
          onUpdate={updateNodeData}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  const colorClasses: Record<string, string> = {
    indigo: 'hover:bg-indigo-50 text-indigo-600',
    violet: 'hover:bg-violet-50 text-violet-600',
    emerald: 'hover:bg-emerald-50 text-emerald-600',
    gray: 'hover:bg-gray-100 text-gray-600',
    orange: 'hover:bg-orange-50 text-orange-600',
  };

  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${colorClasses[color] || ''}`}
      title={`Add ${label} node`}
    >
      + {label}
    </button>
  );
}
