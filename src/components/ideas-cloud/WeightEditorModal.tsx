'use client';

import { useState, useEffect } from 'react';

interface WeightEntry {
  id: string;
  text: string;
  weight: number;
  locked: boolean;
}

interface WeightEditorModalProps {
  ideas: any[];
  onClose: () => void;
  onSave: (updatedIdeas: any[]) => void;
}

export default function WeightEditorModal({ ideas, onClose, onSave }: WeightEditorModalProps) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);

  useEffect(() => {
    setEntries(
      ideas.map((i) => ({
        id: i.id,
        text: i.text,
        weight: Number(i.weight ?? 1),
        locked: Boolean(i.locked),
      }))
    );
  }, [ideas]);

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);

  const handleWeightChange = (id: string, value: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, weight: value } : e))
    );
  };

  const handleLockToggle = (id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, locked: !e.locked } : e))
    );
  };

  const handleSave = () => {
    onSave(entries.map((e) => ({ id: e.id, weight: e.weight, locked: e.locked })));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card-bg rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Weight Editor</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {entries.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">No ideas to weight</p>
          ) : (
            entries.map((entry) => {
              const pct =
                totalWeight > 0
                  ? ((entry.weight / totalWeight) * 100).toFixed(1)
                  : '0.0';
              return (
                <div key={entry.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground truncate max-w-[320px]">
                      {entry.text}
                    </span>
                    <span className="text-xs text-muted shrink-0 ml-2">{pct}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={entry.weight}
                      onChange={(e) =>
                        handleWeightChange(entry.id, Number(e.target.value))
                      }
                      disabled={entry.locked}
                      className="flex-1 accent-[var(--accent)]"
                    />
                    <span className="text-xs font-mono w-8 text-right text-foreground">
                      {Math.round(entry.weight)}
                    </span>
                    <label className="flex items-center gap-1 text-xs text-muted cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={entry.locked}
                        onChange={() => handleLockToggle(entry.id)}
                        className="accent-[var(--accent)]"
                      />
                      Lock
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
