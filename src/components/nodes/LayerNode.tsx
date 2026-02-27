'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  core: { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-700', badge: 'bg-violet-500' },
  context: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', badge: 'bg-blue-500' },
  cultural: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', badge: 'bg-amber-500' },
  reference: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', badge: 'bg-emerald-500' },
  bridge: { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', badge: 'bg-rose-500' },
};

export interface LayerNodeData {
  label: string;
  layerType: string;
  content: string;
  [key: string]: unknown;
}

export default function LayerNode({ data, selected }: NodeProps) {
  const d = data as LayerNodeData;
  const colors = TYPE_COLORS[d.layerType] || TYPE_COLORS.context;

  return (
    <div
      className={`${colors.bg} rounded-xl border-2 shadow-sm px-4 py-3 min-w-[180px] max-w-[260px] ${
        selected ? `${colors.border} shadow-md` : colors.border
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-5 h-5 rounded ${colors.badge} text-white flex items-center justify-center text-[9px] font-bold`}>
          L
        </div>
        <div className={`text-[10px] font-semibold ${colors.text} uppercase tracking-wide`}>
          {d.layerType || 'Layer'}
        </div>
      </div>
      <div className="font-medium text-sm truncate">{d.label || 'Untitled Layer'}</div>
      {d.content && (
        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{d.content}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-white" />
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-white" />
    </div>
  );
}
