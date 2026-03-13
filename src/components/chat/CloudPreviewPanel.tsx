'use client';

import { useState, useCallback } from 'react';
import type { ParsedCloudItem, CloudType } from './CloudParser';

const LAYER_CONFIG: Record<CloudType, { label: string; emoji: string; colorHex: string }> = {
  characters: { label: 'CHARACTERS', emoji: '👤', colorHex: '#6366f1' },
  scenes:     { label: 'STAGE',      emoji: '🎭', colorHex: '#10b981' },
  world:      { label: 'WORLD',      emoji: '🌍', colorHex: '#06b6d4' },
  references: { label: 'REFERENCES', emoji: '📚', colorHex: '#f97316' },
  ideas:      { label: 'IDEAS',      emoji: '💡', colorHex: '#eab308' },
  arc:        { label: 'ARC',        emoji: '🎬', colorHex: '#ec4899' },
};

const LAYER_ORDER: CloudType[] = ['characters', 'scenes', 'world', 'references', 'ideas', 'arc'];

interface CloudPreviewPanelProps {
  items: ParsedCloudItem[];
  projectTitle: string | null;
  isComplete: boolean;
  onSaved?: (count: number) => void;
}

export default function CloudPreviewPanel({ items, projectTitle, isComplete, onSaved }: CloudPreviewPanelProps) {
  // Track checked state per item (keyed by cloud_type::title)
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Track which items have been saved
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [lastSaveCount, setLastSaveCount] = useState(0);

  const itemKey = (item: ParsedCloudItem) => `${item.cloud_type}::${item.title}`;

  const isChecked = (item: ParsedCloudItem) => {
    const key = itemKey(item);
    return checked[key] ?? true; // default checked
  };

  const toggleItem = (item: ParsedCloudItem) => {
    const key = itemKey(item);
    setChecked(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const handleSaveSelected = useCallback(async () => {
    const selected = items.filter(isChecked);
    if (selected.length === 0 || saving) return;
    setSaving(true);

    try {
      const results = await Promise.allSettled(
        selected.map((item) =>
          fetch('/api/v1/cloud-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cloud_type: item.cloud_type,
              title: item.title,
              content: item.content,
              tags: item.tags,
            }),
          })
        )
      );

      const newSaved = new Set(savedItems);
      let successCount = 0;
      selected.forEach((item, i) => {
        if (results[i].status === 'fulfilled') {
          newSaved.add(itemKey(item));
          successCount++;
        }
      });
      setSavedItems(newSaved);
      if (successCount > 0) {
        setLastSaveCount(successCount);
        onSaved?.(successCount);
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  }, [items, checked, saving, savedItems, onSaved]);

  // Group items by cloud_type
  const grouped = new Map<CloudType, ParsedCloudItem[]>();
  for (const item of items) {
    const list = grouped.get(item.cloud_type) || [];
    list.push(item);
    grouped.set(item.cloud_type, list);
  }

  const totalItems = items.length;
  const selectedCount = items.filter(isChecked).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {projectTitle || 'Context Cloud'}
            </h2>
            <p className="text-xs text-muted">
              {totalItems} item{totalItems !== 1 ? 's' : ''} across {grouped.size} layer{grouped.size !== 1 ? 's' : ''}
            </p>
          </div>
          {totalItems > 0 && (
            <button
              onClick={handleSaveSelected}
              disabled={saving || selectedCount === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : `Save selected (${selectedCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Layers */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {totalItems === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3 opacity-30">☁️</div>
            <p className="text-muted text-sm">Your cloud will appear here as you chat.</p>
          </div>
        ) : (
          LAYER_ORDER.map((type) => {
            const layerItems = grouped.get(type);
            if (!layerItems?.length) return null;
            const cfg = LAYER_CONFIG[type];

            return (
              <div key={type} className="rounded-xl border border-border bg-card-bg overflow-hidden">
                <div
                  className="px-3 py-2 text-xs font-bold tracking-wider uppercase flex items-center gap-2"
                  style={{ background: `${cfg.colorHex}12`, color: cfg.colorHex }}
                >
                  <span>{cfg.emoji}</span>
                  <span>{cfg.label}</span>
                  <span className="ml-auto text-[10px] font-medium opacity-70">
                    {layerItems.length}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {layerItems.map((item, idx) => {
                    const key = itemKey(item);
                    const isSaved = savedItems.has(key);
                    return (
                      <div key={`${item.title}-${idx}`} className="px-3 py-2 flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked(item)}
                          onChange={() => toggleItem(item)}
                          className="mt-1 shrink-0 accent-accent"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-foreground">{item.title}</p>
                            {isSaved && (
                              <span className="text-green-600 text-xs font-medium">Saved</span>
                            )}
                          </div>
                          {item.content && (
                            <p className="text-xs text-muted mt-0.5 leading-relaxed">{item.content}</p>
                          )}
                          {item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                  style={{ background: `${cfg.colorHex}18`, color: cfg.colorHex }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* Completion banner */}
        {isComplete && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-sm font-semibold text-green-800 mb-2">
              Your cloud is ready!
            </p>
            <p className="text-xs text-green-600 mb-3">
              {totalItems} items across {grouped.size} layers. Select and save items above.
            </p>
          </div>
        )}

        {/* Post-save workspace links */}
        {lastSaveCount > 0 && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
            <p className="text-sm font-semibold text-foreground mb-1">
              ✅ {lastSaveCount} item{lastSaveCount !== 1 ? 's' : ''} saved to your Cloud
            </p>
            <p className="text-xs text-muted mb-3">Open your workspace to view, edit, and refine them:</p>
            <div className="flex flex-wrap gap-2">
              {([
                { label: 'Characters', href: '/workspace/characters-cloud' },
                { label: 'Stage', href: '/workspace/scenes-cloud' },
                { label: 'World', href: '/workspace/world-cloud' },
                { label: 'Ideas', href: '/workspace/ideas-cloud' },
                { label: 'Arc', href: '/workspace/arc-cloud' },
                { label: 'Visual Editor', href: '/workspace/visual' },
              ] as const).map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-white hover:border-accent/40 transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
