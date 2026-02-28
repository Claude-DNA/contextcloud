'use client';

import React from 'react';

interface Plot {
  id: string;
  name: string;
  content: string | null;
  sort_order: number;
  active_alternative_id: string | null;
  alternatives_count: string | number;
}

interface PlotRowProps {
  plot: Plot;
  isLast?: boolean;
  onClick: () => void;
  onAltClick: () => void;
}

export default function PlotRow({ plot, isLast = true, onClick, onAltClick }: PlotRowProps) {
  const altCount = Number(plot.alternatives_count) || 0;
  const prefix = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group">
      <span className="text-muted text-xs font-mono select-none">{prefix}</span>
      <button
        onClick={onClick}
        className="flex-1 text-left text-sm text-foreground hover:text-accent transition-colors truncate"
      >
        {plot.name}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onAltClick(); }}
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors ${
          altCount > 0
            ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Alt: {altCount}
      </button>
    </div>
  );
}
