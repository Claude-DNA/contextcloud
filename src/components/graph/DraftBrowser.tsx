'use client';

import { useState, useEffect } from 'react';
import { type Node, type Edge } from '@xyflow/react';

interface Draft {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  updated_at: string;
}

interface DraftBrowserProps {
  onLoad: (nodes: Node[], edges: Edge[], title: string, draftId: string) => void;
  onClose: () => void;
}

// Convert a Traditional cloud/flow draft (layers) into ReactFlow nodes
function layersToNodes(draft: {
  title: string;
  content?: { layers?: Array<{ id: string; name: string; type: string; content: string }> };
}): { nodes: Node[]; edges: Edge[] } {
  const layers = draft.content?.layers || [];
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Title node at top
  nodes.push({
    id: 'title',
    type: 'cloudNode',
    position: { x: 300, y: 50 },
    data: {
      type: 'theme',
      title: draft.title,
      content: '',
      color: '#6366f1',
    },
  });

  // One node per layer, arranged vertically
  layers.forEach((layer, i) => {
    const nodeId = layer.id || `layer-${i}`;
    const x = 100 + (i % 2) * 350;
    const y = 180 + Math.floor(i / 2) * 180;

    nodes.push({
      id: nodeId,
      type: 'cloudNode',
      position: { x, y },
      data: {
        type: layerTypeToNodeType(layer.type),
        title: layer.name || `Layer ${i + 1}`,
        content: layer.content || '',
        color: layerTypeToColor(layer.type),
      },
    });

    // Connect to title
    edges.push({
      id: `e-title-${nodeId}`,
      source: 'title',
      target: nodeId,
      type: 'smoothstep',
    });
  });

  return { nodes, edges };
}

function layerTypeToNodeType(layerType: string): string {
  const map: Record<string, string> = {
    core: 'plot',
    context: 'world',
    cultural: 'theme',
    reference: 'bookReference',
    bridge: 'chapterAct',
  };
  return map[layerType] || 'theme';
}

function layerTypeToColor(layerType: string): string {
  const map: Record<string, string> = {
    core: '#6366f1',
    context: '#0ea5e9',
    cultural: '#f59e0b',
    reference: '#10b981',
    bridge: '#ec4899',
  };
  return map[layerType] || '#94a3b8';
}

function typeLabel(type: string): string {
  return type === 'graph' ? 'Canvas' : type === 'flow' ? 'Flow' : 'Cloud';
}

function typeBadgeColor(type: string): string {
  return type === 'graph'
    ? 'bg-indigo-100 text-indigo-700'
    : type === 'flow'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-amber-100 text-amber-700';
}

export default function DraftBrowser({ onLoad, onClose }: DraftBrowserProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/drafts')
      .then(r => r.json())
      .then(d => setDrafts(d.drafts || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleLoad = async (draft: Draft) => {
    setLoadingId(draft.id);
    try {
      const res = await fetch(`/api/v1/drafts/${draft.id}`);
      const data = await res.json();
      const full = data.draft;

      if (full.type === 'graph') {
        // Graph draft — load nodes/edges directly
        const content = typeof full.content === 'string' ? JSON.parse(full.content) : full.content;
        onLoad(content.nodes || [], content.edges || [], full.title, full.id);
      } else {
        // Traditional cloud/flow — convert layers to nodes
        const content = typeof full.content === 'string' ? JSON.parse(full.content) : full.content;
        const { nodes, edges } = layersToNodes({ title: full.title, content });
        onLoad(nodes, edges, full.title, full.id);
      }

      onClose();
    } catch (err) {
      console.error('Failed to load draft:', err);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Open Draft</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading drafts...</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No drafts yet</p>
          ) : (
            drafts.map(draft => (
              <button
                key={draft.id}
                onClick={() => handleLoad(draft)}
                disabled={loadingId === draft.id}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{draft.title || 'Untitled'}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${typeBadgeColor(draft.type)}`}>
                    {typeLabel(draft.type)}
                  </span>
                </div>
                {draft.description && (
                  <p className="text-xs text-gray-500 truncate">{draft.description}</p>
                )}
                <p className="text-[10px] text-gray-400">
                  {new Date(draft.updated_at).toLocaleDateString()}
                  {draft.type !== 'graph' && (
                    <span className="ml-2 text-amber-600">→ will convert layers to nodes</span>
                  )}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
