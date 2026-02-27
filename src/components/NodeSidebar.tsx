'use client';

import type { Node } from '@xyflow/react';

const LAYER_TYPES = ['core', 'context', 'cultural', 'reference', 'bridge'] as const;

interface NodeSidebarProps {
  node: Node | null;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function NodeSidebar({ node, onUpdate, onClose }: NodeSidebarProps) {
  if (!node) return null;

  const data = node.data as Record<string, unknown>;

  function update(key: string, value: unknown) {
    onUpdate(node!.id, { ...data, [key]: value });
  }

  return (
    <div className="w-80 border-l border-border bg-white h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Node Properties</h3>
        <button onClick={onClose} className="text-muted hover:text-foreground transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="text-xs font-mono text-muted bg-gray-50 px-2 py-1 rounded">
          {node.type} &middot; {node.id.slice(0, 8)}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Label</label>
          <input
            type="text"
            value={(data.label as string) || ''}
            onChange={(e) => update('label', e.target.value)}
            className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>

        {(node.type === 'cloudNode' || node.type === 'flowNode') && (
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <textarea
              value={(data.description as string) || ''}
              onChange={(e) => update('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-y"
            />
          </div>
        )}

        {node.type === 'layerNode' && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1">Layer Type</label>
              <select
                value={(data.layerType as string) || 'context'}
                onChange={(e) => update('layerType', e.target.value)}
                className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white"
              >
                {LAYER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Content</label>
              <textarea
                value={(data.content as string) || ''}
                onChange={(e) => update('content', e.target.value)}
                rows={5}
                className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-y font-mono"
              />
            </div>
          </>
        )}

        {node.type === 'referenceNode' && (
          <div>
            <label className="block text-xs font-medium mb-1">URL</label>
            <input
              type="url"
              value={(data.url as string) || ''}
              onChange={(e) => update('url', e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>
        )}

        {node.type === 'connectionNode' && (
          <div>
            <label className="block text-xs font-medium mb-1">Relationship</label>
            <input
              type="text"
              value={(data.relationship as string) || ''}
              onChange={(e) => update('relationship', e.target.value)}
              placeholder="e.g. extends, references, contrasts"
              className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>
        )}
      </div>
    </div>
  );
}
