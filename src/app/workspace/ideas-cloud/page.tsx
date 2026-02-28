'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import IdeaRow from '@/components/ideas-cloud/IdeaRow';
import IdeaEditModal from '@/components/ideas-cloud/IdeaEditModal';
import WeightEditorModal from '@/components/ideas-cloud/WeightEditorModal';
import TransformationsModal from '@/components/ideas-cloud/TransformationsModal';
import FinalStateModal from '@/components/ideas-cloud/FinalStateModal';
import NarrativeLab from '@/components/narrative-lab/NarrativeLab';

interface Idea {
  id: string;
  text: string;
  weight: number;
  locked: boolean;
  final_state_manual: string | null;
  final_state_generated: string | null;
  sort_order: number;
  image_url: string | null;
}

export default function IdeasCloudPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [transCounts, setTransCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Modal state
  const [editModalIdea, setEditModalIdea] = useState<Idea | null>(null);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [transModalIdea, setTransModalIdea] = useState<Idea | null>(null);
  const [fsModalIdea, setFsModalIdea] = useState<Idea | null>(null);

  const fetchIdeas = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ideas');
      const data = await res.json();
      const fetchedIdeas: Idea[] = data.ideas || [];
      setIdeas(fetchedIdeas);

      // Fetch transformation counts in parallel
      const counts: Record<string, number> = {};
      await Promise.all(
        fetchedIdeas.map(async (idea) => {
          try {
            const tRes = await fetch(`/api/v1/ideas/${idea.id}/transformations`);
            const tData = await tRes.json();
            counts[idea.id] = (tData.transformations || []).length;
          } catch {
            counts[idea.id] = 0;
          }
        })
      );
      setTransCounts(counts);
    } catch (err) {
      console.error('Failed to fetch ideas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  // --- Actions ---

  // Open empty edit modal — create only happens on Save
  const handleAdd = () => {
    setEditModalIdea({ id: '', text: '', weight: 1, locked: false, final_state_manual: null, final_state_generated: null, sort_order: 0, image_url: null });
  };

  const handleSaveIdea = async (updated: any) => {
    try {
      if (!updated.id) {
        // New idea — create via POST
        const res = await fetch('/api/v1/ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: updated.text }),
        });
        if (res.ok) {
          await fetchIdeas();
          setEditModalIdea(null);
        }
      } else {
        // Existing idea — update via PUT
        const res = await fetch(`/api/v1/ideas/${updated.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: updated.text }),
        });
        if (res.ok) {
          await fetchIdeas();
          setEditModalIdea(null);
        }
      }
    } catch (err) {
      console.error('Failed to save idea:', err);
    }
  };

  const handleDeleteIdea = async (id: string) => {
    try {
      await fetch(`/api/v1/ideas/${id}`, { method: 'DELETE' });
      await fetchIdeas();
      setEditModalIdea(null);
    } catch (err) {
      console.error('Failed to delete idea:', err);
    }
  };

  const handleWeightSave = async (updates: any[]) => {
    try {
      for (const u of updates) {
        await fetch(`/api/v1/ideas/${u.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weight: u.weight, locked: u.locked }),
        });
      }
      await fetchIdeas();
      setWeightModalOpen(false);
    } catch (err) {
      console.error('Failed to save weights:', err);
    }
  };

  const handleExport = () => {
    const text = ideas.map((i) => i.text).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ideas-export.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        await fetch('/api/v1/ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: line.trim() }),
        });
      }
      await fetchIdeas();
    };
    input.click();
  };

  // --- Render ---

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <div className="flex-1 p-8 w-full">
        <div className="flex gap-8 max-w-7xl mx-auto">
        <div className="flex-1 min-w-0">
          {/* Title bar */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-foreground">Ideas Cloud</h1>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {adding ? 'Adding...' : '+ Add'}
            </button>
          </div>

          {/* Ideas list */}
          <div className="space-y-3 mb-6">
            {loading ? (
              /* Loading skeleton */
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-xl bg-card-bg border border-border animate-pulse"
                  />
                ))}
              </div>
            ) : ideas.length === 0 ? (
              /* Empty state */
              <div className="text-center py-16">
                <p className="text-muted text-sm mb-4">
                  No ideas yet -- add your first idea
                </p>
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
                >
                  + Add Idea
                </button>
              </div>
            ) : (
              ideas.map((idea) => (
                <IdeaRow
                  key={idea.id}
                  idea={idea}
                  transCount={transCounts[idea.id] || 0}
                  onEdit={() => setEditModalIdea(idea)}
                  onWeightClick={() => setWeightModalOpen(true)}
                  onTransClick={() => setTransModalIdea(idea)}
                  onFSClick={() => setFsModalIdea(idea)}
                />
              ))
            )}
          </div>

          {/* Bottom bar */}
          {ideas.length > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <button
                onClick={handleExport}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
              >
                Export
              </button>
              <button
                onClick={handleUpload}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
              >
                Upload
              </button>
            </div>
          )}
        </div>
        {/* Narrative Lab panel */}
        {ideas.length > 0 && (
          <div className="w-80 shrink-0">
            <div className="sticky top-8 border border-border rounded-2xl p-4 bg-card-bg shadow-sm">
              <NarrativeLab ideas={ideas.map(i => ({ id: i.id, text: i.text, weight: Number(i.weight) }))} />
            </div>
          </div>
        )}
        </div>
        </div>
      </main>

      {/* Modals */}
      {editModalIdea && (
        <IdeaEditModal
          idea={editModalIdea}
          onClose={() => setEditModalIdea(null)}
          onSave={handleSaveIdea}
          onDelete={handleDeleteIdea}
        />
      )}

      {weightModalOpen && (
        <WeightEditorModal
          ideas={ideas}
          onClose={() => setWeightModalOpen(false)}
          onSave={handleWeightSave}
        />
      )}

      {transModalIdea && (
        <TransformationsModal
          idea={transModalIdea}
          onClose={() => {
            setTransModalIdea(null);
            fetchIdeas();
          }}
        />
      )}

      {fsModalIdea && (
        <FinalStateModal
          idea={fsModalIdea}
          onClose={() => {
            setFsModalIdea(null);
            fetchIdeas();
          }}
        />
      )}
    </div>
  );
}
