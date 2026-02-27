'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface ConnectionNodeData {
  label: string;
  relationship: string;
  [key: string]: unknown;
}

export default function ConnectionNode({ data, selected }: NodeProps) {
  const d = data as ConnectionNodeData;
  return (
    <div
      className={`bg-orange-50 rounded-full border-2 shadow-sm px-4 py-2 min-w-[120px] text-center ${
        selected ? 'border-orange-500 shadow-orange-100' : 'border-orange-200'
      }`}
    >
      <div className="text-[9px] font-semibold text-orange-600 uppercase tracking-wide mb-0.5">
        {d.relationship || 'Connection'}
      </div>
      <div className="font-medium text-xs truncate">{d.label || 'relates to'}</div>
      <Handle type="source" position={Position.Right} className="!bg-orange-400 !w-2.5 !h-2.5 !border-2 !border-white" />
      <Handle type="target" position={Position.Left} className="!bg-orange-400 !w-2.5 !h-2.5 !border-2 !border-white" />
    </div>
  );
}
