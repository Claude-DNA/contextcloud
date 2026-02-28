'use client';

import React, { useState } from 'react';
import PlotRow from './PlotRow';

interface Plot {
  id: string;
  name: string;
  content: string | null;
  sort_order: number;
  active_alternative_id: string | null;
  alternatives_count: string | number;
}

interface Chapter {
  id: string;
  name: string;
  sort_order: number;
  plots: Plot[];
}

interface ChapterSectionProps {
  chapter: Chapter;
  onRename: (id: string, name: string) => void;
  onAddPlot: (chapterId: string) => void;
  onPlotClick: (plot: Plot) => void;
  onAltClick: (plot: Plot) => void;
}

export default function ChapterSection({ chapter, onRename, onAddPlot, onPlotClick, onAltClick }: ChapterSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(chapter.name);

  const handleRename = () => {
    if (name.trim() && name !== chapter.name) {
      onRename(chapter.id, name.trim());
    }
    setEditing(false);
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Chapter header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-muted hover:text-foreground transition-colors w-5"
        >
          {collapsed ? '\u25B6' : '\u25BC'}
        </button>
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="flex-1 px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent/20"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-medium">{chapter.name}</span>
        )}
        <button
          onClick={() => setEditing(true)}
          className="px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-gray-100 rounded transition-colors"
        >
          rename
        </button>
        <button
          onClick={() => onAddPlot(chapter.id)}
          className="px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors"
        >
          + plot
        </button>
      </div>

      {/* Plots */}
      {!collapsed && (
        <div className="divide-y divide-border">
          {chapter.plots.length === 0 ? (
            <p className="px-4 py-6 text-center text-muted text-xs">
              No plots yet — click &quot;+ plot&quot; to add one
            </p>
          ) : (
            chapter.plots.map((plot, idx) => (
              <PlotRow
                key={plot.id}
                plot={plot}
                isLast={idx === chapter.plots.length - 1}
                onClick={() => onPlotClick(plot)}
                onAltClick={() => onAltClick(plot)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
