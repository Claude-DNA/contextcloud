'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Alternative {
  id: string;
  name: string;
  content: string | null;
  created_at: string;
}

interface AlternativesModalProps {
  plot: { id: string; name: string };
  onClose: () => void;
  onActiveChange: (altId: string | null) => void;
}

export default function AlternativesModal({ plot, onClose, onActiveChange }: AlternativesModalProps) {
  const plotId = plot.id;
  const plotName = plot.name;
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingAlt, setEditingAlt] = useState<Alternative | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchAlternatives = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/plots/${plotId}/alternatives`);
      const data = await res.json();
      setAlternatives(data.alternatives || []);
      setActiveId(data.active_alternative_id || null);
    } catch (err) {
      console.error('Failed to fetch alternatives:', err);
    } finally {
      setLoading(false);
    }
  }, [plotId]);

  useEffect(() => {
    fetchAlternatives();
  }, [fetchAlternatives]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingAlt) {
          setEditingAlt(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, editingAlt]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/v1/plots/${plotId}/alternatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, content: newContent }),
      });
      if (res.ok) {
        setNewName('');
        setNewContent('');
        await fetchAlternatives();
      }
    } catch (err) {
      console.error('Failed to add alternative:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleSetActive = async (altId: string | null) => {
    try {
      await fetch(`/api/v1/plots/${plotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_alternative_id: altId }),
      });
      setActiveId(altId);
      onActiveChange(altId);
    } catch (err) {
      console.error('Failed to set active:', err);
    }
  };

  const handleEditClick = (alt: Alternative) => {
    setEditingAlt(alt);
    setEditContent(alt.content || '');
  };

  const handleSaveEdit = async () => {
    if (!editingAlt) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/v1/plots/${plotId}/alternatives`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingAlt.id, content: editContent }),
      });
      if (res.ok) {
        await fetchAlternatives();
        setEditingAlt(null);
      }
    } catch (err) {
      console.error('Failed to save alternative:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card-bg rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Alternatives</h2>
            <p className="text-xs text-muted">{plotName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Alternatives list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {/* Original option */}
          <div
            className={`border rounded-xl p-3 cursor-pointer transition-colors ${
              !activeId ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30'
            }`}
            onClick={() => handleSetActive(null)}
          >
            <div className="flex items-center gap-2">
              <input type="radio" checked={!activeId} readOnly className="accent-accent" />
              <span className="text-sm font-medium text-foreground">Original</span>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-muted text-sm py-4">Loading...</p>
          ) : (
            alternatives.map(alt => (
              <div
                key={alt.id}
                className={`border rounded-xl p-3 cursor-pointer transition-colors ${
                  activeId === alt.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30'
                }`}
                onClick={() => handleSetActive(alt.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input type="radio" checked={activeId === alt.id} readOnly className="accent-accent" />
                    <span className="text-sm font-medium text-foreground">{alt.name}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditClick(alt); }}
                    className="text-xs text-muted hover:text-foreground transition-colors"
                  >
                    edit
                  </button>
                </div>
                {alt.content && (
                  <p className="text-xs text-muted mt-1 ml-6 truncate">{alt.content.substring(0, 100)}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add new alternative */}
        <div className="border-t border-border px-6 py-4 space-y-3 shrink-0">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Alternative name..."
            className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-card-bg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Alternative content (optional)..."
            className="w-full h-20 px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-card-bg resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
          <div className="flex justify-between">
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || adding}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {adding ? 'Adding...' : '+ Add Alternative'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Inline edit overlay */}
      {editingAlt && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
          <div className="bg-card-bg rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">{editingAlt.name}</h3>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Edit alternative content..."
              className="w-full h-40 px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-card-bg resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingAlt(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
