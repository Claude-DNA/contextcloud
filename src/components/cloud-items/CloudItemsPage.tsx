'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export type CloudType = 'characters' | 'references' | 'scenes' | 'world';

export interface CloudTypeConfig {
  type: CloudType;
  label: string;
  emoji: string;
  color: string;         // tailwind color class fragment e.g. 'blue'
  colorHex: string;
  titlePlaceholder: string;
  contentPlaceholder: string;
  tagPlaceholder: string;
  tagLabel: string;
  fields?: {             // optional extra metadata fields
    key: string;
    label: string;
    placeholder: string;
    options?: string[];  // if set, render as select
  }[];
}

export const CLOUD_CONFIGS: Record<CloudType, CloudTypeConfig> = {
  characters: {
    type: 'characters',
    label: 'Characters Cloud',
    emoji: '👤',
    color: 'blue',
    colorHex: '#3B82F6',
    titlePlaceholder: 'Character name…',
    contentPlaceholder: 'Describe this character — traits, role, inner arc, transformation…',
    tagLabel: 'Traits',
    tagPlaceholder: 'brave, conflicted, survivor…',
    fields: [
      { key: 'role', label: 'Role', placeholder: 'Protagonist / Antagonist / Supporting…' },
      { key: 'arc', label: 'Arc Summary', placeholder: 'Where they start → where they end…' },
    ],
  },
  references: {
    type: 'references',
    label: 'References Cloud',
    emoji: '📚',
    color: 'orange',
    colorHex: '#F97316',
    titlePlaceholder: 'Reference title…',
    contentPlaceholder: 'Notes — what does this reference contribute to the work?',
    tagLabel: 'Tags',
    tagPlaceholder: 'adaptation, parallel theme…',
    fields: [
      {
        key: 'refType', label: 'Type', placeholder: 'book',
        options: ['book', 'film', 'music', 'art', 'article', 'real event', 'other'],
      },
      { key: 'url', label: 'Link / Source', placeholder: 'https://…' },
    ],
  },
  scenes: {
    type: 'scenes',
    label: 'Scenes Cloud',
    emoji: '🎬',
    color: 'green',
    colorHex: '#10B981',
    titlePlaceholder: 'Scene title…',
    contentPlaceholder: 'What happens in this scene? What does it reveal or shift?',
    tagLabel: 'Characters',
    tagPlaceholder: 'Jane, Daniel…',
    fields: [
      { key: 'emotionalState', label: 'Emotional State', placeholder: 'e.g. (Guilt + Wonder) × Curiosity' },
      { key: 'chapter', label: 'Chapter / Act', placeholder: 'Act 3, Ch 7…' },
    ],
  },
  world: {
    type: 'world',
    label: 'World Cloud',
    emoji: '🌍',
    color: 'cyan',
    colorHex: '#06B6D4',
    titlePlaceholder: 'Element name…',
    contentPlaceholder: 'Describe this world-building element — rules, atmosphere, significance…',
    tagLabel: 'Category',
    tagPlaceholder: 'location, rule, system, faction…',
    fields: [
      {
        key: 'category', label: 'Category', placeholder: 'location',
        options: ['location', 'rule / law', 'system / tech', 'faction / group', 'history', 'lore', 'other'],
      },
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
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
      />
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={config.contentPlaceholder}
        rows={4}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:outline-none focus:border-white/30 resize-y"
      />
      <input
        value={tagsRaw}
        onChange={e => setTagsRaw(e.target.value)}
        placeholder={`${config.tagLabel}: ${config.tagPlaceholder}`}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/60 placeholder-white/30 focus:outline-none focus:border-white/30"
      />
      {(config.fields || []).map(f => (
        <div key={f.key}>
          <label className="text-xs text-white/40 mb-1 block">{f.label}</label>
          {f.options ? (
            <select
              value={meta[f.key] || ''}
              onChange={e => setMeta(m => ({ ...m, [f.key]: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
            >
              <option value="">— select —</option>
              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              value={meta[f.key] || ''}
              onChange={e => setMeta(m => ({ ...m, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:outline-none focus:border-white/30"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
          style={{ background: config.colorHex }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors">
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

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/cloud-items?type=${cloudType}`);
      const data = await res.json();
      setItems(data.items || []);
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

  const filtered = search.trim()
    ? items.filter(it =>
        it.title.toLowerCase().includes(search.toLowerCase()) ||
        it.content.toLowerCase().includes(search.toLowerCase()) ||
        it.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : items;

  return (
    <div className="flex h-screen bg-app-bg text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 ml-60 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            <h1 className="text-xl font-bold text-white mb-1">
              {config.emoji} {config.label}
            </h1>

            {/* Toolbar */}
            <div className="flex items-center gap-3">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20"
              />
              <button
                onClick={() => { setAdding(true); setEditingId(null); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white whitespace-nowrap transition-colors hover:opacity-90"
                style={{ background: config.colorHex }}
              >
                + Add {config.label.replace(' Cloud', '')}
              </button>
            </div>

            {/* Add form */}
            {adding && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-3">New Item</div>
                <ItemForm
                  config={config}
                  onSave={handleCreate}
                  onCancel={() => setAdding(false)}
                  saving={saving}
                />
              </div>
            )}

            {/* Items list */}
            {loading ? (
              <div className="text-center py-20 text-white/30 text-sm">Loading…</div>
            ) : filtered.length === 0 && !adding ? (
              <div className="text-center py-20 space-y-3">
                <div className="text-4xl">{config.emoji}</div>
                <p className="text-white/30 text-sm">
                  {search ? 'No items match your search.' : `No ${config.label.toLowerCase()} yet. Add your first one above.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(item => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden group"
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
                            <h3 className="font-semibold text-white">{item.title}</h3>
                            {/* Extra metadata fields */}
                            {(config.fields || []).map(f => item.metadata[f.key] && (
                              <div key={f.key} className="mt-0.5">
                                <span className="text-xs text-white/30">{f.label}: </span>
                                {f.key === 'url' ? (
                                  <a href={item.metadata[f.key]} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:underline">{item.metadata[f.key]}</a>
                                ) : (
                                  <span className="text-xs" style={{ color: config.colorHex }}>{item.metadata[f.key]}</span>
                                )}
                              </div>
                            ))}
                            {item.content && (
                              <p className="mt-2 text-sm text-white/60 leading-relaxed whitespace-pre-wrap line-clamp-4">{item.content}</p>
                            )}
                            {item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {item.tags.map(tag => (
                                  <span key={tag}
                                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                                    style={{ background: `${config.colorHex}22`, color: config.colorHex }}
                                  >{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => { setEditingId(item.id); setAdding(false); }}
                              className="px-2 py-1 text-xs text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
                            >Edit</button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="px-2 py-1 text-xs text-red-400/60 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                            >Delete</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
