'use client';

import { useState, useEffect } from 'react';

interface CloudItemFinalStateModalProps {
  item: { id: string; title: string };
  colorHex: string;
  onClose: () => void;
}

export default function CloudItemFinalStateModal({
  item,
  colorHex,
  onClose,
}: CloudItemFinalStateModalProps) {
  const [manual, setManual] = useState('');
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/cloud-items/${item.id}/final-state`);
        const data = await res.json();
        if (data.finalState) {
          setManual(data.finalState.final_state_manual || '');
          setGenerated(data.finalState.final_state_generated || '');
        }
      } catch (err) {
        console.error('Failed to load final state:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [item.id]);

  const handleSaveManual = async () => {
    setSaving(true);
    try {
      await fetch(`/api/v1/cloud-items/${item.id}/final-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual', text: manual }),
      });
    } catch (err) {
      console.error('Failed to save manual final state:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/v1/cloud-items/${item.id}/final-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate' }),
      });
      const data = await res.json();
      if (data.finalState) {
        setGenerated(data.finalState.final_state_generated || '');
      }
    } catch (err) {
      console.error('Failed to generate final state:', err);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-card-bg rounded-2xl shadow-2xl p-8 border border-border">
          <p className="text-muted text-sm">Loading final state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card-bg rounded-2xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Final State</h2>
            <p className="text-xs text-muted truncate max-w-[500px]">{item.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors text-xl leading-none shrink-0 ml-4"
          >
            &times;
          </button>
        </div>

        {/* Body: side by side */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT: Your vision */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Your vision</h3>
              <textarea
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Describe where this character ends up — their state, relationships, beliefs by the final act…"
                className="w-full h-64 px-3 py-2 border border-border rounded-xl text-sm text-foreground bg-white resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <button
                onClick={handleSaveManual}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                style={{ background: colorHex }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>

            {/* RIGHT: AI prediction */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">AI prediction</h3>
              <div className="w-full h-64 px-3 py-2 border border-border rounded-xl text-sm overflow-y-auto bg-gray-50">
                {generated ? (
                  <p className="text-foreground whitespace-pre-wrap">{generated}</p>
                ) : (
                  <p className="text-muted italic">
                    No AI prediction yet. Click Generate to create one based on character traits and arc.
                  </p>
                )}
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                style={{ background: colorHex }}
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
