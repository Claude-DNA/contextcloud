'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

interface ExtractedItem {
  cloud_type: string;
  title: string;
  content: string;
  tags: string[];
}

const LAYER_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  characters: { emoji: '\u{1F464}', color: '#6366f1', label: 'Characters' },
  scenes:     { emoji: '\u{1F3AD}', color: '#10b981', label: 'Stage' },
  world:      { emoji: '\u{1F30D}', color: '#06b6d4', label: 'World' },
  references: { emoji: '\u{1F4DA}', color: '#f97316', label: 'References' },
  ideas:      { emoji: '\u{1F4A1}', color: '#eab308', label: 'Ideas' },
  arc:        { emoji: '\u{1F3AC}', color: '#ec4899', label: 'Arc' },
};

export default function QuickCapturePage() {
  const [text, setText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState('');
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleExtract = async () => {
    if (!text.trim() || text.trim().length < 10) {
      showToast('Please enter at least 10 characters');
      return;
    }

    setExtracting(true);
    setItems([]);
    setSavedCount(null);

    try {
      const res = await fetch('/api/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Extraction failed');
        return;
      }

      setItems(data.items || []);
      setSelected(new Set((data.items || []).map((_: ExtractedItem, i: number) => i)));

      if ((data.items || []).length === 0) {
        showToast('No items could be extracted');
      }
    } catch {
      showToast('Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    const toSave = items.filter((_, i) => selected.has(i));
    if (toSave.length === 0) {
      showToast('No items selected');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/v1/cloud-items/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'direct',
          items: toSave.map(item => ({
            cloud_type: item.cloud_type,
            title: item.title,
            content: item.content || '',
            tags: item.tags || [],
          })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Save failed');
        return;
      }

      setSavedCount(data.count || toSave.length);
      showToast(`${data.count || toSave.length} items saved to your clouds`);
    } catch {
      showToast('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((_, i) => i)));
    }
  };

  // Group items by layer
  const grouped = items.reduce<Record<string, { item: ExtractedItem; index: number }[]>>((acc, item, i) => {
    const key = item.cloud_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push({ item, index: i });
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <div className="flex-1 p-8 w-full">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-xl font-semibold text-foreground mb-1">Quick Capture</h1>
            <p className="text-sm text-muted mb-6">
              Paste notes, scenes, ideas, anything — we'll extract and save to your clouds.
            </p>

            {/* Input area */}
            <div className="mb-6">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste notes, scenes, ideas, anything..."
                rows={10}
                className="w-full rounded-xl border border-border bg-card-bg p-4 text-sm text-foreground placeholder:text-muted resize-y focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted">
                  {text.length > 0 ? `${text.length} characters` : ''}
                </span>
                <button
                  onClick={handleExtract}
                  disabled={extracting || text.trim().length < 10}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {extracting ? 'Extracting...' : 'Extract & Preview'}
                </button>
              </div>
            </div>

            {/* Results */}
            {items.length > 0 && (
              <div className="border border-border rounded-xl bg-card-bg overflow-hidden">
                {/* Results header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {items.length} items extracted
                    </span>
                    <button
                      onClick={toggleAll}
                      className="text-xs text-accent hover:underline"
                    >
                      {selected.size === items.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <span className="text-xs text-muted">
                    {selected.size} selected
                  </span>
                </div>

                {/* Grouped items */}
                <div className="divide-y divide-border">
                  {Object.entries(LAYER_CONFIG).map(([type, config]) => {
                    const group = grouped[type];
                    if (!group || group.length === 0) return null;
                    return (
                      <div key={type} className="px-5 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span>{config.emoji}</span>
                          <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: config.color }}
                          >
                            {config.label}
                          </span>
                          <span className="text-xs text-muted">({group.length})</span>
                        </div>
                        <div className="space-y-1.5">
                          {group.map(({ item, index }) => (
                            <label
                              key={index}
                              className="flex items-start gap-2.5 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(index)}
                                onChange={() => toggleItem(index)}
                                className="mt-1 rounded border-border accent-accent"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                                  {item.title}
                                </div>
                                {item.content && (
                                  <div className="text-xs text-muted mt-0.5 line-clamp-2">
                                    {item.content}
                                  </div>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Save bar */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-white/50">
                  {savedCount !== null ? (
                    <span className="text-sm text-green-600 font-medium">
                      Saved {savedCount} items to your clouds
                    </span>
                  ) : (
                    <span className="text-xs text-muted">
                      Uncheck items you don't want to save
                    </span>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving || selected.size === 0 || savedCount !== null}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : savedCount !== null ? 'Saved' : `Save ${selected.size} to Clouds`}
                  </button>
                </div>
              </div>
            )}

            {/* Extracting skeleton */}
            {extracting && (
              <div className="border border-border rounded-xl bg-card-bg p-6">
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-8 rounded-lg bg-border/30 animate-pulse" />
                  ))}
                </div>
                <p className="text-xs text-muted mt-4 text-center">Extracting items from your text...</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-foreground text-white px-4 py-2.5 rounded-lg text-sm shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  );
}
