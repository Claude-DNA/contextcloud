'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface CloudNodeData {
  label: string;
  description: string;
  [key: string]: unknown;
}

export default function CloudNode({ data, selected }: NodeProps) {
  const d = data as CloudNodeData;
  return (
    <div
      className={`bg-white rounded-xl border-2 shadow-sm px-4 py-3 min-w-[200px] max-w-[280px] ${
        selected ? 'border-indigo-500 shadow-indigo-100' : 'border-indigo-200'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold">
          CL
        </div>
        <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Cloud</div>
      </div>
      <div className="font-medium text-sm truncate">{d.label || 'Untitled Cloud'}</div>
      {d.description && (
        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{d.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}
