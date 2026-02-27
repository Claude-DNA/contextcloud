'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface ReferenceNodeData {
  label: string;
  url: string;
  [key: string]: unknown;
}

export default function ReferenceNode({ data, selected }: NodeProps) {
  const d = data as ReferenceNodeData;
  return (
    <div
      className={`bg-gray-50 rounded-xl border-2 shadow-sm px-4 py-3 min-w-[160px] max-w-[240px] ${
        selected ? 'border-gray-500 shadow-gray-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded bg-gray-500 text-white flex items-center justify-center text-[9px] font-bold">
          R
        </div>
        <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Reference</div>
      </div>
      <div className="font-medium text-sm truncate">{d.label || 'Untitled Reference'}</div>
      {d.url && (
        <div className="text-xs text-blue-500 mt-1 truncate">{d.url}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-white" />
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-white" />
    </div>
  );
}
