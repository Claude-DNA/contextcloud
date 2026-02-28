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

  // Generate state
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [weightProfile, setWeightProfile] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // AI Suggest state
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const plotIndex = allPlots.findIndex(p => p.id === plot.id);
  const prevPlot = plotIndex > 0 ? allPlots[plotIndex - 1] : null;
  const nextPlot = plotIndex < allPlots.length - 1 ? allPlots[plotIndex + 1] : null;

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

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  const totalWeight = ideas.reduce((sum, i) => sum + Number(i.weight), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      onSave({ id: plot.id, name, content });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError('');
    setGeneratedContent('');
    setLastPrompt('');
    setWeightProfile('');
    try {
      const res = await fetch(`/api/v1/plots/${plot.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error || 'Generation failed');
        return;
      }
      setGeneratedContent(data.content || '');
      setLastPrompt(data.prompt || '');
      setWeightProfile(data.weightProfile || '');
    } catch (err) {
      setGenerateError(String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    setContent(prev => prev ? prev + '\n\n' + generatedContent : generatedContent);
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestions([]);
    try {
      const res = await fetch('/api/v1/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeType: 'plot',
          nodeTitle: name,
          nodeContent: content,
          connections: prevPlot ? [{ type: 'previous', title: prevPlot.name, content: prevPlot.content || '' }] : [],
          proxies: ideas.length > 0 ? [{ type: 'ideas', elements: ideas.map(i => i.text) }] : [],
        }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Suggest failed:', err);
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = (s: string) => {
    setContent(prev => prev ? prev + '\n\n' + s : s);
    setSuggestions([]);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card-bg rounded-2xl shadow-2xl max-w-7xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-foreground">Plot Editor</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors text-xl leading-none">&times;</button>
        </div>

        {/* 3-Panel layout */}
        <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden min-h-0">

          {/* LEFT: Input context */}
          <div className="border-r border-border p-4 overflow-y-auto space-y-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Input Context</h3>

            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Previous Plot</p>
              {prevPlot ? (
                <div className="border border-border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-medium text-foreground mb-1">{prevPlot.name}</p>
                  <p className="text-xs text-muted line-clamp-4">
                    {prevPlot.content ? prevPlot.content.substring(0, 200) + (prevPlot.content.length > 200 ? '...' : '') : 'No content'}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted italic">No previous plot</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Ideas</p>
              {ideasLoading ? (
                <p className="text-xs text-muted italic">Loading...</p>
              ) : ideas.length === 0 ? (
                <p className="text-xs text-muted italic">No ideas yet</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {ideas.map(idea => {
                    const pct = totalWeight > 0 ? ((Number(idea.weight) / totalWeight) * 100).toFixed(1) : '0.0';
                    return (
                      <div key={idea.id} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px]">{pct}%</span>
                        <span className="text-foreground line-clamp-2">{idea.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* MIDDLE: Edit */}
          <div className="border-r border-border p-4 overflow-y-auto space-y-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Edit</h3>

            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Plot name"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-medium text-foreground bg-card-bg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />

            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write plot content..."
              className="w-full h-48 px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-card-bg resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent leading-relaxed"
            />

            {/* AI Suggest */}
            <button
              onClick={handleSuggest}
              disabled={suggesting}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors disabled:opacity-50 w-full"
            >
              {suggesting ? 'Getting suggestions...' : 'AI Suggest'}
            </button>

            {suggestions.length > 0 && (
              <div className="space-y-1">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => applySuggestion(s)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-foreground border border-border hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Dimension EQ */}
            <div className="border border-border rounded-lg p-4">
              <DimensionEQMixer plotId={plot.id} onSave={() => {}} />
            </div>
          </div>

          {/* RIGHT: Output / Generate */}
          <div className="p-4 overflow-y-auto space-y-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Output</h3>

            {/* Next plot */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Next Plot</p>
              {nextPlot ? (
                <div className="border border-border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-medium text-foreground mb-1">{nextPlot.name}</p>
                  <p className="text-xs text-muted line-clamp-3">
                    {nextPlot.content ? nextPlot.content.substring(0, 150) + (nextPlot.content.length > 150 ? '...' : '') : 'No content'}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted italic">Last plot in arc</p>
              )}
            </div>

            {/* Weight profile summary */}
            {weightProfile && (
              <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2 leading-relaxed">
                {weightProfile}
              </p>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : 'Generate'}
            </button>

            {generateError && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{generateError}</p>
            )}

            {/* Generated content */}
            {generatedContent && (
              <div className="space-y-2">
                <div className="border border-border rounded-lg p-3 max-h-64 overflow-y-auto bg-gray-50">
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{generatedContent}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleApply}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                  >
                    Apply →
                  </button>
                  <button
                    onClick={() => setShowPrompt(v => !v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted hover:text-foreground transition-colors"
                  >
                    {showPrompt ? 'Hide Prompt ▴' : 'Show Prompt ▾'}
                  </button>
                </div>

                {showPrompt && lastPrompt && (
                  <div className="border border-border rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-900">
                    <pre className="text-[10px] text-green-400 whitespace-pre-wrap font-mono">{lastPrompt}</pre>
                  </div>
                )}
              </div>
            )}

            {!generatedContent && !generating && (
              <div className="border border-dashed border-border rounded-lg p-4 min-h-[100px] flex items-center justify-center">
                <p className="text-xs text-muted italic text-center">
                  Set weights in the Edit panel,<br />then click Generate
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
