'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChapterSection from '@/components/arc-cloud/ChapterSection';
import PlotEditorModal from '@/components/arc-cloud/PlotEditorModal';
import AlternativesModal from '@/components/arc-cloud/AlternativesModal';

interface Arc {
  id: string;
  name: string;
  description: string | null;
}

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

export default function ArcCloudPage() {
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [arcDropdownOpen, setArcDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Modal states
  const [editingPlot, setEditingPlot] = useState<Plot | null>(null);
  const [altPlot, setAltPlot] = useState<Plot | null>(null);

  const selectedArc = arcs.find(a => a.id === selectedArcId) || null;

  // Collect all plots in order for the editor
  const allPlots = chapters.flatMap(ch => ch.plots);

  // Fetch arcs list
  const fetchArcs = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/arcs');
      const data = await res.json();
      const arcList: Arc[] = data.arcs || [];
      setArcs(arcList);
      if (arcList.length > 0 && !selectedArcId) {
        setSelectedArcId(arcList[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch arcs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedArcId]);

  // Fetch chapters+plots for selected arc
  const fetchChapters = useCallback(async () => {
    if (!selectedArcId) {
      setChapters([]);
      return;
    }
    setChaptersLoading(true);
    try {
      const res = await fetch(`/api/v1/arcs/${selectedArcId}/chapters`);
      const data = await res.json();
      setChapters(data.chapters || []);
    } catch (err) {
      console.error('Failed to fetch chapters:', err);
    } finally {
      setChaptersLoading(false);
    }
  }, [selectedArcId]);

  useEffect(() => {
    fetchArcs();
  }, [fetchArcs]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setArcDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Create new arc
  const handleNewArc = async () => {
    const name = prompt('New arc name:');
    if (!name?.trim()) return;
    const description = prompt('Description (optional):') || '';
    try {
      const res = await fetch('/api/v1/arcs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchArcs();
        setSelectedArcId(data.arc?.id || data.id);
        setArcDropdownOpen(false);
      }
    } catch (err) {
      console.error('Failed to create arc:', err);
    }
  };

  // Add chapter
  const handleAddChapter = async () => {
    if (!selectedArcId) return;
    const name = prompt('Chapter name:');
    if (!name?.trim()) return;
    try {
      const res = await fetch(`/api/v1/arcs/${selectedArcId}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        await fetchChapters();
      }
    } catch (err) {
      console.error('Failed to add chapter:', err);
    }
  };

  // Add plot to chapter
  const handleAddPlot = async (chapterId: string) => {
    const name = prompt('Plot name:');
    if (!name?.trim()) return;
    try {
      const res = await fetch(`/api/v1/chapters/${chapterId}/plots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), content: '' }),
      });
      if (res.ok) {
        await fetchChapters();
      }
    } catch (err) {
      console.error('Failed to add plot:', err);
    }
  };

  // Rename chapter
  const handleRenameChapter = async (chapterId: string, newName: string) => {
    try {
      await fetch(`/api/v1/arcs/${selectedArcId}/chapters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chapterId, name: newName }),
      });
      await fetchChapters();
    } catch (err) {
      console.error('Failed to rename chapter:', err);
    }
  };

  // Plot editor save
  const handlePlotSave = async (updated: { id: string; name: string; content: string }) => {
    try {
      await fetch(`/api/v1/plots/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: updated.name, content: updated.content }),
      });
      await fetchChapters();
      setEditingPlot(null);
    } catch (err) {
      console.error('Failed to save plot:', err);
    }
  };

  // Active alternative change
  const handleActiveAltChange = async (altId: string | null) => {
    if (!altPlot) return;
    try {
      await fetch(`/api/v1/plots/${altPlot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_alternative_id: altId }),
      });
      await fetchChapters();
    } catch (err) {
      console.error('Failed to set active alternative:', err);
    }
  };

  // Export
  const handleExport = () => {
    const lines: string[] = [];
    for (const ch of chapters) {
      lines.push(`## ${ch.name}`);
      for (const p of ch.plots) {
        lines.push(`### ${p.name}`);
        lines.push(p.content || '');
        lines.push('');
      }
    }
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedArc?.name || 'arc'}-export.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Upload
  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !selectedArcId) return;
      const text = await file.text();
      // Simple parse: ## = chapter, ### = plot
      const chapterBlocks = text.split(/^## /m).filter(b => b.trim());
      for (const block of chapterBlocks) {
        const lines = block.split('\n');
        const chapterName = lines[0]?.trim();
        if (!chapterName) continue;
        const chRes = await fetch(`/api/v1/arcs/${selectedArcId}/chapters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: chapterName }),
        });
        if (!chRes.ok) continue;
        const chData = await chRes.json();
        const chapterId = chData.chapter?.id || chData.id;
        if (!chapterId) continue;

        const plotBlocks = block.split(/^### /m).slice(1);
        for (const pBlock of plotBlocks) {
          const pLines = pBlock.split('\n');
          const plotName = pLines[0]?.trim();
          const plotContent = pLines.slice(1).join('\n').trim();
          if (!plotName) continue;
          await fetch(`/api/v1/chapters/${chapterId}/plots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: plotName, content: plotContent }),
          });
        }
      }
      await fetchChapters();
    };
    input.click();
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <div className="flex-1 p-8 max-w-5xl mx-auto w-full">
          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">
                Arc Cloud{selectedArc ? `: ${selectedArc.name}` : ''}
              </h1>
            </div>

            {/* Arc selector dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setArcDropdownOpen(!arcDropdownOpen)}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2"
              >
                {selectedArc ? 'Switch Arc' : 'New Arc'}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {arcDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-card-bg border border-border rounded-xl shadow-lg z-20 overflow-hidden">
                  <div className="max-h-60 overflow-y-auto">
                    {arcs.map(arc => (
                      <button
                        key={arc.id}
                        onClick={() => { setSelectedArcId(arc.id); setArcDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          arc.id === selectedArcId
                            ? 'bg-accent/10 text-accent font-medium'
                            : 'text-foreground hover:bg-gray-50'
                        }`}
                      >
                        {arc.name}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-border">
                    <button
                      onClick={handleNewArc}
                      className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-accent/5 transition-colors font-medium"
                    >
                      + New Arc
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <p className="text-center text-muted text-sm py-16">Loading arcs...</p>
          ) : arcs.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted text-sm mb-4">No arcs yet. Create your first arc to get started.</p>
              <button
                onClick={handleNewArc}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                + New Arc
              </button>
            </div>
          ) : chaptersLoading ? (
            <p className="text-center text-muted text-sm py-16">Loading chapters...</p>
          ) : (
            <>
              {/* Chapters list */}
              <div className="space-y-3">
                {chapters.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-border rounded-xl">
                    <p className="text-muted text-sm mb-3">No chapters yet. Add your first chapter.</p>
                    <button
                      onClick={handleAddChapter}
                      className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                    >
                      + Add Chapter
                    </button>
                  </div>
                ) : (
                  chapters.map(chapter => (
                    <ChapterSection
                      key={chapter.id}
                      chapter={chapter}
                      onPlotClick={(plot) => setEditingPlot(plot)}
                      onAltClick={(plot) => setAltPlot(plot)}
                      onAddPlot={handleAddPlot}
                      onRename={handleRenameChapter}
                    />
                  ))
                )}
              </div>

              {/* Bottom bar */}
              {chapters.length > 0 && (
                <div className="flex items-center gap-3 border-t border-border pt-4 mt-6">
                  <button
                    onClick={handleAddChapter}
                    className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                  >
                    + Add Chapter
                  </button>
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 text-sm border border-border text-foreground rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Export
                  </button>
                  <button
                    onClick={handleUpload}
                    className="px-4 py-2 text-sm border border-border text-foreground rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Upload
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      {editingPlot && (
        <PlotEditorModal
          plot={editingPlot}
          allPlots={allPlots}
          onClose={() => setEditingPlot(null)}
          onSave={handlePlotSave}
        />
      )}

      {altPlot && (
        <AlternativesModal
          plot={altPlot}
          onClose={() => { setAltPlot(null); fetchChapters(); }}
          onActiveChange={handleActiveAltChange}
        />
      )}
    </div>
  );
}
