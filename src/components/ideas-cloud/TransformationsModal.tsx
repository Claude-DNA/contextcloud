'use client';

import { useState, useEffect, useCallback } from 'react';

interface Transformation {
  id: string;
  text: string;
  weight: number;
  locked: boolean;
  transform_type: string;
  source_node_id: string | null;
  source_node_level: string | null;
}

interface TransformationsModalProps {
  idea: any;
  onClose: () => void;
}

export default function TransformationsModal({ idea, onClose }: TransformationsModalProps) {
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState<'additive' | 'override'>('additive');
  const [saving, setSaving] = useState(false);

  const fetchTransformations = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/ideas/${idea.id}/transformations`);
      const data = await res.json();
      setTransformations(data.transformations || []);
    } catch (err) {
      console.error('Failed to fetch transformations:', err);
    } finally {
      setLoading(false);
    }
  }, [idea.id]);

  useEffect(() => {
    fetchTransformations();
  }, [fetchTransformations]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/ideas/${idea.id}/transformations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText.trim(), transform_type: newType }),
      });
      if (res.ok) {
        setNewText('');
        setNewType('additive');
        await fetchTransformations();
      }
    } catch (err) {
      console.error('Failed to add transformation:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card-bg rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Transformations</h2>
            <p className="text-xs text-muted truncate max-w-[420px]">{idea.text}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors text-xl leading-none shrink-0 ml-4"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {loading ? (
            <div className="py-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : transformations.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">
              No transformations yet
            </p>
          ) : (
            transformations.map((t) => (
              <div
                key={t.id}
                className="border border-border rounded-xl p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground flex-1">{t.text}</p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                      t.transform_type === 'override'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {t.transform_type}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Number(t.weight)}
                    readOnly
                    className="flex-1 accent-[var(--accent)]"
                  />
                  <span className="text-xs font-mono w-8 text-right text-foreground">
                    {Math.round(Number(t.weight))}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-muted select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(t.locked)}
                      readOnly
                      className="accent-[var(--accent)]"
                    />
                    Lock
                  </label>
                </div>
                {t.source_node_level && (
                  <p className="text-xs text-muted">
                    Source: {t.source_node_level}
                    {t.source_node_id ? ` (${t.source_node_id})` : ''}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add form */}
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Add transformation..."
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-card-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as 'additive' | 'override')}
              className="px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-card-bg focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="additive">Additive</option>
              <option value="override">Override</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={handleAdd}
              disabled={!newText.trim() || saving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add'}
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
    </div>
  );
}
