'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DimensionEQMixer from './DimensionEQMixer';

interface Plot {
  id: string;
  name: string;
  content: string | null;
  sort_order?: number;
}

interface Idea {
  id: string;
  text: string;
  weight: number;
}

interface PlotEditorModalProps {
  plot: Plot;
  allPlots: Plot[];
  onClose: () => void;
  onSave: (updated: { id: string; name: string; content: string }) => void;
}

export default function PlotEditorModal({ plot, allPlots, onClose, onSave }: PlotEditorModalProps) {
  const [name, setName] = useState(plot.name);
  const [content, setContent] = useState(plot.content || '');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Find previous and next plots based on position in allPlots
  const plotIndex = allPlots.findIndex(p => p.id === plot.id);
  const prevPlot = plotIndex > 0 ? allPlots[plotIndex - 1] : null;
  const nextPlot = plotIndex < allPlots.length - 1 ? allPlots[plotIndex + 1] : null;

  // Fetch ideas for the left panel
  const fetchIdeas = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ideas');
      if (res.ok) {
        const data = await res.json();
        setIdeas(data.ideas || []);
      }
    } catch (err) {
      console.error('Failed to fetch ideas:', err);
    } finally {
      setIdeasLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  // Compute normalized percentages for ideas
  const totalWeight = ideas.reduce((sum, i) => sum + Number(i.weight), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      onSave({ id: plot.id, name, content });
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card-bg rounded-2xl shadow-2xl max-w-7xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-foreground">Plot Editor</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* 3-Panel layout */}
        <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden min-h-0">
          {/* LEFT panel: Input context */}
          <div className="border-r border-border p-4 overflow-y-auto space-y-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Input Context</h3>

            {/* Previous plot snippet */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Previous Plot</p>
              {prevPlot ? (
                <div className="border border-border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-medium text-foreground mb-1">{prevPlot.name}</p>
                  <p className="text-xs text-muted line-clamp-4">
                    {prevPlot.content
                      ? prevPlot.content.substring(0, 200) + (prevPlot.content.length > 200 ? '...' : '')
                      : 'No content'}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted italic">No previous plot (this is the first)</p>
              )}
            </div>

            {/* Ideas list with normalized percentages */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Ideas</p>
              {ideasLoading ? (
                <p className="text-xs text-muted italic">Loading ideas...</p>
              ) : ideas.length === 0 ? (
                <p className="text-xs text-muted italic">No ideas yet</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {ideas.map(idea => {
                    const pct = totalWeight > 0
                      ? ((Number(idea.weight) / totalWeight) * 100).toFixed(1)
                      : '0.0';
                    return (
                      <div key={idea.id} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px]">
                          {pct}%
                        </span>
                        <span className="text-foreground line-clamp-2">{idea.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* MIDDLE panel: Edit */}
          <div className="border-r border-border p-4 overflow-y-auto space-y-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Edit</h3>

            {/* Plot name */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Plot name"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-medium text-foreground bg-card-bg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />

            {/* Content textarea */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write plot content..."
              className="w-full h-56 px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-card-bg resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent leading-relaxed"
            />

            {/* AI Suggest button (stub) */}
            <button
              disabled
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted cursor-not-allowed opacity-50"
              title="Coming soon"
            >
              AI Suggest (coming soon)
            </button>

            {/* Dimension EQ Mixer */}
            <div className="border border-border rounded-lg p-4">
              <DimensionEQMixer
                plotId={plot.id}
                onSave={() => {}}
              />
            </div>
          </div>

          {/* RIGHT panel: Output */}
          <div className="p-4 overflow-y-auto space-y-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Output</h3>

            {/* Next plot snippet */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Next Plot</p>
              {nextPlot ? (
                <div className="border border-border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-medium text-foreground mb-1">{nextPlot.name}</p>
                  <p className="text-xs text-muted line-clamp-4">
                    {nextPlot.content
                      ? nextPlot.content.substring(0, 200) + (nextPlot.content.length > 200 ? '...' : '')
                      : 'No content'}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted italic">No next plot (this is the last)</p>
              )}
            </div>

            {/* Generate button (stub) */}
            <button
              disabled
              className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted cursor-not-allowed opacity-50"
              title="Coming soon"
            >
              Generate (coming soon)
            </button>

            {/* Generated preview area */}
            <div className="border border-dashed border-border rounded-lg p-4 min-h-[120px]">
              <p className="text-xs text-muted italic">
                Generated preview will appear here once AI generation is available.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
