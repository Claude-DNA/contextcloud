'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useProject } from '@/context/ProjectContext';

interface ArcScene {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  attached_count: number;
}

interface AttachedItem {
  id: string;
  title: string;
  content: string;
  cloud_type: string;
  tags: string[];
  metadata: Record<string, string>;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  characters: { label: 'Characters', color: '#6366f1' },
  references: { label: 'References', color: '#f97316' },
  scenes:     { label: 'Stage',      color: '#10b981' },
  world:      { label: 'World',      color: '#06b6d4' },
  ideas:      { label: 'Ideas',      color: '#eab308' },
};

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors bg-white';

export default function ArcCloudPage() {
  const router = useRouter();
  const { activeProjectId } = useProject();
  const [scenes, setScenes] = useState<ArcScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attachedItems, setAttachedItems] = useState<Record<string, AttachedItem[]>>({});
  const [attachedLoading, setAttachedLoading] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');

  const fetchScenes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeProjectId) params.set('project_id', activeProjectId);
      const res = await fetch(`/api/v1/arc-scenes?${params}`);
      const data = await res.json();
      setScenes(data.scenes || []);
    } catch (err) {
      console.error('Failed to fetch scenes:', err);
    }
    setLoading(false);
  }, [activeProjectId]);

  useEffect(() => {
    fetch('/api/v1/ping').catch(() => {});
  }, []);

  useEffect(() => { fetchScenes(); }, [fetchScenes]);

  const fetchAttached = async (arcItemId: string) => {
    setAttachedLoading(arcItemId);
    try {
      const res = await fetch(`/api/v1/arc-scenes/${arcItemId}/items`);
      const data = await res.json();
      setAttachedItems(prev => ({ ...prev, [arcItemId]: data.items || [] }));
    } catch (err) {
      console.error('Failed to fetch attached items:', err);
    }
    setAttachedLoading(null);
  };

  const handleExpand = (sceneId: string) => {
    if (expandedId === sceneId) {
      setExpandedId(null);
    } else {
      setExpandedId(sceneId);
      if (!attachedItems[sceneId]) {
        fetchAttached(sceneId);
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/cloud-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloud_type: 'arc', title: formTitle.trim(), content: formContent, tags: [], metadata: {}, project_id: activeProjectId || undefined }),
      });
      if (res.ok) {
        setAdding(false);
        setFormTitle('');
        setFormContent('');
        await fetchScenes();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleUpdate = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/cloud-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle.trim(), content: formContent }),
      });
      if (res.ok) {
        setEditingId(null);
        setFormTitle('');
        setFormContent('');
        await fetchScenes();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scene and detach all items? This cannot be undone.')) return;
    await fetch(`/api/v1/cloud-items/${id}`, { method: 'DELETE' });
    if (expandedId === id) setExpandedId(null);
    await fetchScenes();
  };

  const startEdit = (scene: ArcScene) => {
    setEditingId(scene.id);
    setAdding(false);
    setFormTitle(scene.title);
    setFormContent(scene.content);
  };

  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
  };

  // Group attached items by cloud_type
  const groupItems = (items: AttachedItem[]) => {
    const grouped: Record<string, AttachedItem[]> = {};
    for (const item of items) {
      if (!grouped[item.cloud_type]) grouped[item.cloud_type] = [];
      grouped[item.cloud_type].push(item);
    }
    return grouped;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <div className="flex-1 p-8 w-full">
          <div className="max-w-3xl mx-auto">

            {/* Title bar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Story Structure
                </h1>
                <p className="text-sm text-muted mt-0.5">Build your arc. Each scene is a turning point.</p>
              </div>
              <button
                onClick={() => { setAdding(true); setEditingId(null); setFormTitle(''); setFormContent(''); }}
                disabled={adding}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: '#ec4899' }}
              >
                + Add Scene
              </button>
            </div>

            {/* Add form */}
            {adding && (
              <div className="mb-4 rounded-xl border border-border bg-card-bg p-4">
                <p className="text-xs text-muted uppercase tracking-wider mb-3">New Scene</p>
                <form onSubmit={handleCreate} className="space-y-3">
                  <input
                    autoFocus
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="Story beat…"
                    className={inputCls}
                  />
                  <textarea
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    placeholder="What happens at this turning point — the shift, the consequence, the surprise…"
                    rows={3}
                    className={`${inputCls} resize-y`}
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={saving || !formTitle.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
                      style={{ background: '#ec4899' }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={cancelForm} className="px-4 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-gray-50 transition-colors border border-border">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Scene list */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-card-bg border border-border animate-pulse" />
                ))}
              </div>
            ) : scenes.length === 0 && !adding ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">🎬</div>
                <p className="text-muted text-sm mb-4">No arc scenes yet. Add your first scene to start building the scaffold.</p>
                <button
                  onClick={() => { setAdding(true); setFormTitle(''); setFormContent(''); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
                  style={{ background: '#ec4899' }}
                >
                  + Add Scene
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {scenes.map(scene => (
                  <div
                    key={scene.id}
                    className="rounded-xl border border-border bg-card-bg overflow-hidden group"
                    style={{ borderLeftColor: '#ec4899', borderLeftWidth: 3 }}
                  >
                    {editingId === scene.id ? (
                      <div className="p-4">
                        <form onSubmit={(e) => handleUpdate(scene.id, e)} className="space-y-3">
                          <input
                            autoFocus
                            value={formTitle}
                            onChange={e => setFormTitle(e.target.value)}
                            placeholder="Story beat…"
                            className={inputCls}
                          />
                          <textarea
                            value={formContent}
                            onChange={e => setFormContent(e.target.value)}
                            placeholder="What happens at this turning point…"
                            rows={3}
                            className={`${inputCls} resize-y`}
                          />
                          <div className="flex gap-2 pt-1">
                            <button
                              type="submit"
                              disabled={saving || !formTitle.trim()}
                              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
                              style={{ background: '#ec4899' }}
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button type="button" onClick={cancelForm} className="px-4 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-gray-50 transition-colors border border-border">
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <div>
                        {/* Scene header — clickable to expand */}
                        <button
                          onClick={() => handleExpand(scene.id)}
                          className="w-full text-left p-4 hover:bg-gray-50/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground">{scene.title}</h3>
                                {scene.attached_count > 0 && (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                                    style={{ background: '#ec489918', color: '#ec4899' }}
                                  >
                                    {scene.attached_count} attached
                                  </span>
                                )}
                              </div>
                              {scene.content && (
                                <p className="mt-1 text-sm text-muted leading-relaxed line-clamp-2">{scene.content}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => startEdit(scene)}
                                  className="px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-gray-100 rounded transition-colors"
                                >Edit</button>
                                <button
                                  onClick={() => handleDelete(scene.id)}
                                  className="px-2 py-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                >Delete</button>
                              </div>
                              <svg
                                className={`w-4 h-4 text-muted transition-transform ${expandedId === scene.id ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </button>

                        {/* Expanded: attached items grouped by type */}
                        {expandedId === scene.id && (
                          <div className="border-t border-border px-4 py-3 bg-gray-50/30">
                            {attachedLoading === scene.id ? (
                              <p className="text-xs text-muted py-2">Loading attached items...</p>
                            ) : !attachedItems[scene.id] || attachedItems[scene.id].length === 0 ? (
                              <div className="text-center py-4">
                                <p className="text-xs text-muted mb-2">No items attached to this scene yet.</p>
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    disabled
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted cursor-not-allowed opacity-60"
                                    title="Coming soon"
                                  >
                                    Attach items
                                  </button>
                                  <button
                                    onClick={() => router.push(`/workspace/visual?scene=${scene.id}&sceneName=${encodeURIComponent(scene.title)}`)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 transition-opacity"
                                    style={{ background: '#ec4899' }}
                                  >
                                    Open in Editor
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {Object.entries(groupItems(attachedItems[scene.id])).map(([type, items]) => {
                                  const typeInfo = TYPE_LABELS[type] || { label: type, color: '#6b7280' };
                                  return (
                                    <div key={type}>
                                      <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: typeInfo.color }}>
                                        {typeInfo.label} ({items.length})
                                      </p>
                                      <div className="space-y-1">
                                        {items.map(item => (
                                          <div
                                            key={item.id}
                                            className="px-3 py-2 rounded-lg bg-card-bg border border-border text-sm"
                                            style={{ borderLeftColor: typeInfo.color, borderLeftWidth: 2 }}
                                          >
                                            <span className="font-medium text-foreground">{item.title}</span>
                                            {item.content && (
                                              <p className="text-xs text-muted mt-0.5 line-clamp-1">{item.content}</p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="pt-1 flex items-center gap-2">
                                  <button
                                    disabled
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted cursor-not-allowed opacity-60"
                                    title="Coming soon"
                                  >
                                    Attach items
                                  </button>
                                  <button
                                    onClick={() => router.push(`/workspace/visual?scene=${scene.id}&sceneName=${encodeURIComponent(scene.title)}`)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 transition-opacity"
                                    style={{ background: '#ec4899' }}
                                  >
                                    Open in Editor
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
