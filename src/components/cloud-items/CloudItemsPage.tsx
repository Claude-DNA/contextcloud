'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import CloudItemTransformationsModal from './CloudItemTransformationsModal';
import CloudItemFinalStateModal from './CloudItemFinalStateModal';

export type CloudType = 'characters' | 'references' | 'scenes' | 'world';

export interface CloudTypeConfig {
  type: CloudType;
  label: string;
  emoji: string;
  colorHex: string;
  titlePlaceholder: string;
  contentPlaceholder: string;
  tagLabel: string;
  tagPlaceholder: string;
  fields?: {
    key: string;
    label: string;
    placeholder: string;
    options?: string[];
  }[];
}

export const CLOUD_CONFIGS: Record<CloudType, CloudTypeConfig> = {
  characters: {
    type: 'characters',
    label: 'Characters Cloud',
    emoji: '👤',
    colorHex: '#6366f1',
    titlePlaceholder: 'Character name…',
    contentPlaceholder: 'Describe this character — who they are, what drives them, how they change…',
    tagLabel: 'Traits',
    tagPlaceholder: 'determined, conflicted, loyal…',
    fields: [
      { key: 'role', label: 'Role', placeholder: 'Protagonist / Antagonist / Supporting…' },
      { key: 'arc', label: 'Arc Summary', placeholder: 'Starting state → ending state…' },
    ],
  },
  references: {
    type: 'references',
    label: 'References Cloud',
    emoji: '📚',
    colorHex: '#f97316',
    titlePlaceholder: 'Reference title…',
    contentPlaceholder: 'What does this reference contribute — themes, tone, structural parallel, contrast…',
    tagLabel: 'Tags',
    tagPlaceholder: 'parallel theme, contrast, influence…',
    fields: [
      {
        key: 'refType', label: 'Type', placeholder: 'Select type',
        options: ['book', 'film', 'music', 'art', 'article', 'real event', 'other'],
      },
      { key: 'url', label: 'Link / Source', placeholder: 'https://…' },
    ],
  },
  scenes: {
    type: 'scenes',
    label: 'Stage Cloud',
    emoji: '🎭',
    colorHex: '#10b981',
    titlePlaceholder: 'Location name…',
    contentPlaceholder: 'Describe this place — atmosphere, sensory qualities, how it feels to inhabit it, what it reveals about the world…',
    tagLabel: 'Tags',
    tagPlaceholder: 'interior, vast, hostile, quiet…',
    fields: [
      {
        key: 'locationType', label: 'Type', placeholder: 'Select type',
        options: ['interior', 'exterior', 'space', 'virtual / VR', 'transitional', 'other'],
      },
      { key: 'scale', label: 'Scale / Size', placeholder: 'vast, intimate, claustrophobic…' },
    ],
  },
  world: {
    type: 'world',
    label: 'World Cloud',
    emoji: '🌍',
    colorHex: '#06b6d4',
    titlePlaceholder: 'Universe element name…',
    contentPlaceholder: 'Describe this aspect of the universe — its nature, scope, how it came to be, what it means for those who live inside it…',
    tagLabel: 'Tags',
    tagPlaceholder: 'ancient, civilisation-wide, irreversible…',
    fields: [
      { key: 'scope', label: 'Scope', placeholder: 'civilisation-wide / planetary / cosmic / personal…' },
      { key: 'origin', label: 'Origin / Age', placeholder: 'ancient / recent / unknown…' },
    ],
  },
};

interface CloudItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, string>;
  created_at: string;
}

/* ── Shared input / textarea classes ── */
const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors bg-white';
const textareaCls = `${inputCls} resize-y`;

interface ItemFormProps {
  config: CloudTypeConfig;
  initial?: Partial<CloudItem>;
  onSave: (data: Omit<CloudItem, 'id' | 'created_at'>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function ItemForm({ config, initial, onSave, onCancel, saving }: ItemFormProps) {
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [tagsRaw, setTagsRaw] = useState((initial?.tags || []).join(', '));
  const [meta, setMeta] = useState<Record<string, string>>(initial?.metadata || {});
  const [generatingTags, setGeneratingTags] = useState(false);

  const handleGenerateTags = async () => {
    if (!title.trim() && !content.trim()) return;
    setGeneratingTags(true);
    try {
      const res = await fetch('/api/v1/cloud-items/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudType: config.type, title, content }),
      });
      const data = await res.json();
      if (data.tags?.length) {
        const existing = tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean);
        const merged = [...new Set([...existing, ...data.tags])];
        setTagsRaw(merged.join(', '));
      }
    } catch { /* ignore */ }
    setGeneratingTags(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      content,
      tags: tagsRaw.split(',').map(t => t.trim()).filter(Boolean),
      metadata: meta,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={config.titlePlaceholder}
        className={inputCls}
      />
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={config.contentPlaceholder}
        rows={4}
        className={textareaCls}
      />
      <div className="flex gap-2 items-center">
        <input
          value={tagsRaw}
          onChange={e => setTagsRaw(e.target.value)}
          placeholder={`${config.tagLabel}: ${config.tagPlaceholder}`}
          className={inputCls}
        />
        <button
          type="button"
          onClick={handleGenerateTags}
          disabled={generatingTags || (!title.trim() && !content.trim())}
          className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium border border-border text-muted hover:text-foreground hover:bg-gray-50 disabled:opacity-40 transition-colors whitespace-nowrap"
          title="Generate tags from title + description"
        >
          {generatingTags ? '…' : '✦ Generate'}
        </button>
      </div>
      {(config.fields || []).map(f => (
        <div key={f.key}>
          <label className="text-xs text-muted mb-1 block">{f.label}</label>
          {f.options ? (
            <select
              value={meta[f.key] || ''}
              onChange={e => setMeta(m => ({ ...m, [f.key]: e.target.value }))}
              className={inputCls}
            >
              <option value="">— select —</option>
              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              value={meta[f.key] || ''}
              onChange={e => setMeta(m => ({ ...m, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className={inputCls}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
          style={{ background: config.colorHex }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-gray-50 transition-colors border border-border"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function CloudItemsPage({ cloudType }: { cloudType: CloudType }) {
  const config = CLOUD_CONFIGS[cloudType];
  const [items, setItems] = useState<CloudItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [transCounts, setTransCounts] = useState<Record<string, number>>({});
  const [transModalItem, setTransModalItem] = useState<CloudItem | null>(null);
  const [fsModalItem, setFsModalItem] = useState<CloudItem | null>(null);

  const withTransformations = cloudType === 'characters';

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/cloud-items?type=${cloudType}`);
      const data = await res.json();
      const fetched: CloudItem[] = data.items || [];
      setItems(fetched);

      // Fetch transformation counts for characters
      if (cloudType === 'characters' && fetched.length > 0) {
        const counts: Record<string, number> = {};
        await Promise.all(
          fetched.map(async (item) => {
            try {
              const tRes = await fetch(`/api/v1/cloud-items/${item.id}/transformations`);
              const tData = await tRes.json();
              counts[item.id] = (tData.transformations || []).length;
            } catch {
              counts[item.id] = 0;
            }
          })
        );
        setTransCounts(counts);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [cloudType]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = async (data: Omit<CloudItem, 'id' | 'created_at'>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/cloud-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloud_type: cloudType, ...data }),
      });
      const json = await res.json();
      if (res.ok) { setItems(prev => [...prev, json.item]); setAdding(false); }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleUpdate = async (id: string, data: Omit<CloudItem, 'id' | 'created_at'>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/cloud-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) { setItems(prev => prev.map(it => it.id === id ? json.item : it)); setEditingId(null); }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    await fetch(`/api/v1/cloud-items/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        await fetch('/api/v1/cloud-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cloud_type: cloudType, title: line, content: '', tags: [], metadata: {} }),
        });
      }
      await fetchItems();
    };
    input.click();
  }, [cloudType, fetchItems]);

  const filtered = search.trim()
    ? items.filter(it =>
        it.title.toLowerCase().includes(search.toLowerCase()) ||
        it.content.toLowerCase().includes(search.toLowerCase()) ||
        it.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : items;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <div className="flex-1 p-8 w-full">
          <div className="max-w-3xl mx-auto">

            {/* Title bar */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-xl font-semibold text-foreground">
                {config.emoji} {config.label}
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
                >
                  Upload
                </button>
                <button
                  onClick={() => { setAdding(true); setEditingId(null); }}
                  disabled={adding}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ background: config.colorHex }}
                >
                  + Add {config.label.replace(' Cloud', '')}
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className={inputCls}
              />
            </div>

            {/* Add form */}
            {adding && (
              <div className="mb-4 rounded-xl border border-border bg-card-bg p-4">
                <p className="text-xs text-muted uppercase tracking-wider mb-3">New Item</p>
                <ItemForm
                  config={config}
                  onSave={handleCreate}
                  onCancel={() => setAdding(false)}
                  saving={saving}
                />
              </div>
            )}

            {/* List */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-card-bg border border-border animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 && !adding ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">{config.emoji}</div>
                <p className="text-muted text-sm mb-4">
                  {search ? 'No items match your search.' : `No ${config.label.toLowerCase()} yet.`}
                </p>
                {!search && (
                  <button
                    onClick={() => setAdding(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
                    style={{ background: config.colorHex }}
                  >
                    + Add {config.label.replace(' Cloud', '')}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(item => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-card-bg overflow-hidden group"
                    style={{ borderLeftColor: config.colorHex, borderLeftWidth: 3 }}
                  >
                    {editingId === item.id ? (
                      <div className="p-4">
                        <ItemForm
                          config={config}
                          initial={item}
                          onSave={data => handleUpdate(item.id, data)}
                          onCancel={() => setEditingId(null)}
                          saving={saving}
                        />
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground">{item.title}</h3>
                            {(config.fields || []).map(f => item.metadata?.[f.key] && (
                              <div key={f.key} className="mt-0.5">
                                <span className="text-xs text-muted">{f.label}: </span>
                                {f.key === 'url' ? (
                                  <a href={item.metadata[f.key]} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-accent hover:underline">{item.metadata[f.key]}</a>
                                ) : (
                                  <span className="text-xs font-medium" style={{ color: config.colorHex }}>{item.metadata[f.key]}</span>
                                )}
                              </div>
                            ))}
                            {item.content && (
                              <p className="mt-1.5 text-sm text-muted leading-relaxed line-clamp-3">{item.content}</p>
                            )}
                            {item.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {item.tags.map(tag => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded text-[11px] font-medium"
                                    style={{ background: `${config.colorHex}18`, color: config.colorHex }}
                                  >{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Transformation + Final State badges (characters only) */}
                            {withTransformations && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setTransModalItem(item); }}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                  title="Transformations"
                                >
                                  T:{transCounts[item.id] ?? 0}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setFsModalItem(item); }}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                  title="Final State"
                                >
                                  FS
                                </button>
                              </>
                            )}
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => { setEditingId(item.id); setAdding(false); }}
                                className="px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-gray-100 rounded transition-colors"
                              >Edit</button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="px-2 py-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              >Delete</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Modals — characters cloud */}
      {transModalItem && (
        <CloudItemTransformationsModal
          item={transModalItem}
          colorHex={config.colorHex}
          onClose={() => { setTransModalItem(null); fetchItems(); }}
        />
      )}
      {fsModalItem && (
        <CloudItemFinalStateModal
          item={fsModalItem}
          colorHex={config.colorHex}
          onClose={() => setFsModalItem(null)}
        />
      )}
    </div>
  );
}
