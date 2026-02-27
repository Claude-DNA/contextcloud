'use client';

import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

const LAYER_TYPES = ['core', 'context', 'cultural', 'reference', 'bridge'] as const;

interface Layer {
  id: string;
  name: string;
  type: (typeof LAYER_TYPES)[number];
  content: string;
}

function TraditionalEditorInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const draftId = searchParams.get('id');
  const initialType = searchParams.get('type') || 'cloud';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'cloud' | 'flow'>(initialType as 'cloud' | 'flow');
  const [layers, setLayers] = useState<Layer[]>([
    { id: crypto.randomUUID(), name: 'Core Layer', type: 'core', content: '' },
  ]);
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);

  // Load existing draft
  useEffect(() => {
    if (!draftId || status !== 'authenticated') return;
    fetch(`/api/v1/drafts/${draftId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.draft) {
          setTitle(data.draft.title || '');
          setDescription(data.draft.description || '');
          setType(data.draft.type || 'cloud');
          if (data.draft.layers_json && Array.isArray(data.draft.layers_json)) {
            setLayers(data.draft.layers_json);
          }
        }
      })
      .catch(() => {});
  }, [draftId, status]);

  function addLayer() {
    setLayers([
      ...layers,
      { id: crypto.randomUUID(), name: '', type: 'context', content: '' },
    ]);
  }

  function removeLayer(id: string) {
    if (layers.length <= 1) return;
    setLayers(layers.filter((l) => l.id !== id));
  }

  function updateLayer(id: string, field: keyof Layer, value: string) {
    setLayers(layers.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  async function saveDraft() {
    if (!session) return;
    setSaving(true);
    setMessage(null);
    try {
      const method = currentDraftId ? 'PUT' : 'POST';
      const body = {
        ...(currentDraftId ? { id: currentDraftId } : {}),
        title: title || 'Untitled',
        description,
        type,
        layers,
      };

      const res = await fetch('/api/v1/drafts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Save failed' });
        return;
      }

      const savedId = data.draft?.id || currentDraftId;
      setCurrentDraftId(savedId);
      setMessage({ type: 'success', text: 'Draft saved' });

      // Update URL if new draft
      if (!currentDraftId && savedId) {
        router.replace(`/workspace/traditional?id=${savedId}`);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!session) return;
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Title is required to publish' });
      return;
    }
    if (layers.every((l) => !l.content.trim())) {
      setMessage({ type: 'error', text: 'Add content to at least one layer' });
      return;
    }

    setPublishing(true);
    setMessage(null);
    try {
      // Save draft first
      await saveDraft();

      const res = await fetch('/api/v1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: currentDraftId,
          title,
          description,
          type,
          layers,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Publish failed' });
        return;
      }

      setMessage({
        type: 'success',
        text: `Published! View at ${data.published?.url || 'contextube.ai'}`,
      });
    } catch {
      setMessage({ type: 'error', text: 'Failed to publish' });
    } finally {
      setPublishing(false);
    }
  }

  if (status === 'loading') {
    return <div className="p-8 animate-pulse"><div className="h-8 w-64 bg-gray-200 rounded" /></div>;
  }

  if (!session) {
    return (
      <div className="p-8 text-center text-muted">
        <p>Please sign in to use the editor.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">
          {currentDraftId ? 'Edit' : 'New'} {type === 'cloud' ? 'Cloud' : 'Flow'}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={saveDraft}
            disabled={saving}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={publish}
            disabled={publishing}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {publishing ? 'Publishing...' : 'Publish to ContextTube'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Basic fields */}
      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'cloud' ? 'My Context Cloud' : 'My Context Flow'}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is this about?"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-y"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1.5">Content Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'cloud' | 'flow')}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white"
            >
              <option value="cloud">Cloud</option>
              <option value="flow">Flow</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1.5">Tags</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="philosophy, film, AI (comma-separated)"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* Layers */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Layers</h2>
          <button
            onClick={addLayer}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-accent hover:bg-accent/5 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Layer
          </button>
        </div>

        <div className="space-y-4">
          {layers.map((layer, idx) => (
            <div
              key={layer.id}
              className="border border-border rounded-xl p-4 hover:border-accent/20 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-mono text-muted w-6">#{idx + 1}</span>
                <input
                  type="text"
                  value={layer.name}
                  onChange={(e) => updateLayer(layer.id, 'name', e.target.value)}
                  placeholder="Layer name"
                  className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <select
                  value={layer.type}
                  onChange={(e) => updateLayer(layer.id, 'type', e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white"
                >
                  {LAYER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
                {layers.length > 1 && (
                  <button
                    onClick={() => removeLayer(layer.id)}
                    className="p-1.5 text-muted hover:text-red-500 transition-colors"
                    title="Remove layer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <textarea
                value={layer.content}
                onChange={(e) => updateLayer(layer.id, 'content', e.target.value)}
                rows={5}
                placeholder="Layer content (supports markdown)"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-y font-mono"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TraditionalEditor() {
  return (
    <Suspense fallback={<div className="p-8 animate-pulse"><div className="h-8 w-64 bg-gray-200 rounded" /></div>}>
      <TraditionalEditorInner />
    </Suspense>
  );
}
