'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useProject } from '@/context/ProjectContext';

interface CloudItem {
  id: string;
  cloud_type: string;
  title: string;
  content: string;
}

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

  // Attach items modal state
  const [attachModalSceneId, setAttachModalSceneId] = useState<string | null>(null);
  const [attachAllItems, setAttachAllItems] = useState<Record<string, CloudItem[]>>({});
  const [attachChecked, setAttachChecked] = useState<Set<string>>(new Set());
  const [attachGroupCollapsed, setAttachGroupCollapsed] = useState<Set<string>>(new Set());
  const [attachLoadingModal, setAttachLoadingModal] = useState(false);
  const [attachSaving, setAttachSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

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

  // Open "Attach items" modal for a scene
  const openAttachModal = useCallback(async (sceneId: string) => {
    setAttachModalSceneId(sceneId);
    setAttachAllItems({});
    setAttachChecked(new Set());
    setAttachGroupCollapsed(new Set());
    setAttachLoadingModal(true);
    try {
      const params = new URLSearchParams();
      if (activeProjectId) params.set('project_id', activeProjectId);
      // to-nodes returns all types in one call: {nodes: [{id, cloud_type, title, content, ...}]}
      const res = await fetch(`/api/v1/cloud-items/to-nodes?${params}`);
      const data = await res.json();
      const items: CloudItem[] = (data.nodes || []).filter((i: CloudItem) => i.cloud_type !== 'arc');
      const groups: Record<string, CloudItem[]> = {};
      for (const item of items) {
        if (!groups[item.cloud_type]) groups[item.cloud_type] = [];
        groups[item.cloud_type].push(item);
      }
      setAttachAllItems(groups);
      // Pre-check items already attached to this scene
      const alreadyAttached = attachedItems[sceneId] || [];
      setAttachChecked(new Set(alreadyAttached.map(i => i.id)));
    } catch {
      showToast('Failed to load items');
      setAttachModalSceneId(null);
    }
    setAttachLoadingModal(false);
  }, [activeProjectId, attachedItems, showToast]);

  // Confirm attach: compare new selection vs already attached, add/remove as needed
  const handleAttachConfirm = useCallback(async () => {
    if (!attachModalSceneId) return;
    setAttachSaving(true);
    try {
      const alreadyAttached = new Set((attachedItems[attachModalSceneId] || []).map(i => i.id));
      const toAttach = [...attachChecked].filter(id => !alreadyAttached.has(id));
      const toDetach = [...alreadyAttached].filter(id => !attachChecked.has(id));

      await Promise.all([
        ...toAttach.map(id =>
          fetch('/api/v1/arc-scenes/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cloud_item_id: id, arc_item_id: attachModalSceneId }),
          })
        ),
        ...toDetach.map(id =>
          fetch('/api/v1/arc-scenes/attach', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cloud_item_id: id, arc_item_id: attachModalSceneId }),
          })
        ),
      ]);

      // Refresh the attached items for this scene
      await fetchAttached(attachModalSceneId);
      await fetchScenes();
      setAttachModalSceneId(null);
      showToast(`${toAttach.length} attached, ${toDetach.length} detached`);
    } catch {
      showToast('Failed to save changes');
    }
    setAttachSaving(false);
  }, [attachModalSceneId, attachChecked, attachedItems, fetchAttached, fetchScenes, showToast]);

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
                                    onClick={() => openAttachModal(scene.id)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-pink-300 text-pink-600 hover:bg-pink-50 transition-colors"
                                  >
                                    + Attach items
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
                                    onClick={() => openAttachModal(scene.id)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-pink-300 text-pink-600 hover:bg-pink-50 transition-colors"
                                  >
                                    ✏️ Edit attached
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

      {/* ── Attach Items Modal ────────────────────────────────────────────────── */}
      {attachModalSceneId && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAttachModalSceneId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Attach Items to Scene</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Select items from your Clouds to connect to this scene.
                </p>
              </div>
              <button
                onClick={() => setAttachModalSceneId(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              {attachLoadingModal ? (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading items...
                </div>
              ) : Object.keys(attachAllItems).length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  No cloud items found. Add some items to your Clouds first.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select all / clear */}
                  <div className="flex items-center justify-between mb-1 pb-2 border-b border-gray-100">
                    <span className="text-xs text-gray-500">{attachChecked.size} selected</span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setAttachChecked(new Set(Object.values(attachAllItems).flat().map(i => i.id)))}
                        className="text-xs text-indigo-600 hover:underline"
                      >Select all</button>
                      <button
                        onClick={() => setAttachChecked(new Set())}
                        className="text-xs text-gray-400 hover:underline"
                      >Clear</button>
                    </div>
                  </div>

                  {Object.entries(attachAllItems).map(([cloudType, items]) => {
                    const TYPE_INFO: Record<string, { label: string; emoji: string }> = {
                      characters: { label: 'Characters', emoji: '👤' },
                      scenes:     { label: 'Stage',      emoji: '🎬' },
                      world:      { label: 'World',      emoji: '🌍' },
                      ideas:      { label: 'Ideas',      emoji: '💡' },
                      references: { label: 'References', emoji: '📑' },
                    };
                    const info = TYPE_INFO[cloudType] || { label: cloudType, emoji: '☁️' };
                    const isCollapsed = attachGroupCollapsed.has(cloudType);
                    const groupCheckedCount = items.filter(i => attachChecked.has(i.id)).length;
                    const allChecked = groupCheckedCount === items.length;

                    return (
                      <div key={cloudType} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div
                          className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                          onClick={() => setAttachGroupCollapsed(prev => {
                            const next = new Set(prev);
                            isCollapsed ? next.delete(cloudType) : next.add(cloudType);
                            return next;
                          })}
                        >
                          <span className="text-xs text-gray-400">{isCollapsed ? '▶' : '▼'}</span>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={e => {
                              e.stopPropagation();
                              setAttachChecked(prev => {
                                const next = new Set(prev);
                                items.forEach(i => allChecked ? next.delete(i.id) : next.add(i.id));
                                return next;
                              });
                            }}
                            className="rounded border-gray-300"
                          />
                          <span>{info.emoji}</span>
                          <span className="text-sm font-medium text-gray-700">{info.label}</span>
                          <span className="text-xs text-gray-400 ml-auto">{groupCheckedCount}/{items.length}</span>
                        </div>
                        {!isCollapsed && (
                          <div className="px-3 py-1 space-y-0.5 max-h-40 overflow-y-auto">
                            {items.map(item => (
                              <label key={item.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm">
                                <input
                                  type="checkbox"
                                  checked={attachChecked.has(item.id)}
                                  onChange={() => setAttachChecked(prev => {
                                    const next = new Set(prev);
                                    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                    return next;
                                  })}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-gray-700 truncate">{item.title || '(untitled)'}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setAttachModalSceneId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAttachConfirm}
                disabled={attachSaving}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: '#ec4899' }}
              >
                {attachSaving ? 'Saving...' : `Save (${attachChecked.size} items)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg z-50 transition-opacity">
          {toast}
        </div>
      )}
    </div>
  );
}
