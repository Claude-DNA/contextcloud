'use client';

/**
 * The flow editor: one reading of a work in ConteXtube's five layers, edited directly.
 * What you see here is what gets published. Older drafts (free-form layer types) are converted on load.
 */

import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useProject } from '@/context/ProjectContext';
import {
  FLOW_LAYERS,
  estimateTokens,
  toFlowChunks,
  validateFlow,
  type FlowChunk,
  type FlowMeta,
  type Rights,
} from '@/lib/flow';

type Msg = { type: 'success' | 'error' | 'info'; text: string; href?: string } | null;

const input =
  'w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent';

const newChunk = (layer: FlowChunk['layer']): FlowChunk => ({
  id: crypto.randomUUID(),
  layer,
  type: layer === 5 ? 'meta' : 'idea',
  text: '',
});

function FlowEditorInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { projects, activeProjectId } = useProject();

  const draftId = searchParams.get('id');
  // ?from_project=<id> drafts from that project on arrival; 'none' means items without a project.
  const fromProjectParam = searchParams.get('from_project');
  const fromProject = fromProjectParam === 'none' ? '' : fromProjectParam;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [chunks, setChunks] = useState<FlowChunk[]>([]);
  const [meta, setMeta] = useState<FlowMeta>({ rights: 'own' });
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);
  const [projectChoice, setProjectChoice] = useState<string>(fromProject ?? activeProjectId ?? '');
  const [projectInfo, setProjectInfo] = useState<{ items: number; has_source: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [message, setMessage] = useState<Msg>(null);
  const autoDrafted = useRef(false);

  // Load an existing draft.
  useEffect(() => {
    if (!draftId || status !== 'authenticated') return;
    fetch(`/api/v1/drafts/${draftId}`)
      .then((r) => r.json())
      .then((data) => {
        const d = data.draft;
        if (!d) return;
        setTitle(d.title || '');
        setDescription(d.description || '');
        setChunks(toFlowChunks(d.layers_json, () => crypto.randomUUID()));
        const m = (d.meta_json ?? {}) as FlowMeta;
        setMeta({ rights: 'own', ...m });
        if (m.project_id) setProjectChoice(m.project_id);
      })
      .catch(() => setMessage({ type: 'error', text: 'Could not load this draft.' }));
  }, [draftId, status]);

  // What the chosen project holds (cloud items, stored source text).
  useEffect(() => {
    if (status !== 'authenticated') return;
    const q = projectChoice ? `?project_id=${encodeURIComponent(projectChoice)}` : '';
    fetch(`/api/v1/flows/draft${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProjectInfo(d))
      .catch(() => setProjectInfo(null));
  }, [projectChoice, status]);

  const draftFromProject = useCallback(async () => {
    setDrafting(true);
    setConfirmReplace(false);
    setMessage({ type: 'info', text: 'Drafting the five layers from your project. This takes up to a minute.' });
    try {
      const res = await fetch('/api/v1/flows/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectChoice || null,
          work: { title: meta.source_title || undefined, author: meta.source_author || undefined, rights: meta.rights ?? 'own' },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.message || data.error || 'Drafting failed.' });
        return;
      }
      setChunks(data.chunks);
      if (!title && data.title) setTitle(data.title);
      if (!description && data.description) setDescription(data.description);
      setMeta((m) => ({
        ...m,
        project_id: projectChoice || null,
        include_source: m.include_source ?? data.has_source,
        source_title: m.source_title || data.source_title || undefined,
        source_author: m.source_author || data.source_author || undefined,
      }));
      setMessage({
        type: data.unverified ? 'info' : 'success',
        text: data.unverified
          ? `Draft ready. ${data.unverified} quote${data.unverified === 1 ? '' : 's'} couldn't be found in your source and ${data.unverified === 1 ? 'is' : 'are'} marked: check ${data.unverified === 1 ? 'it' : 'them'} before publishing.`
          : 'Draft ready. Edit anything, then publish.',
      });
    } catch {
      setMessage({ type: 'error', text: 'Drafting failed. Check your connection and try again.' });
    } finally {
      setDrafting(false);
    }
  }, [projectChoice, title, description, meta.source_title, meta.source_author, meta.rights]);

  // Arriving from "Make a flow" with ?from_project=: draft straight away (new flows only).
  useEffect(() => {
    if (fromProjectParam === null || draftId || autoDrafted.current || status !== 'authenticated') return;
    autoDrafted.current = true;
    draftFromProject();
  }, [fromProjectParam, draftId, status, draftFromProject]);

  const problems = useMemo(() => validateFlow(title, chunks, meta), [title, chunks, meta]);
  const problemIds = useMemo(() => new Set(problems.map((p) => p.chunkId).filter(Boolean)), [problems]);

  function update(id: string, patch: Partial<FlowChunk>) {
    setChunks((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function remove(id: string) {
    setChunks((cs) => cs.filter((c) => c.id !== id));
  }
  function add(layer: FlowChunk['layer']) {
    setChunks((cs) => [...cs, newChunk(layer)]);
  }

  async function saveDraft(): Promise<string | null> {
    if (!session) return null;
    setSaving(true);
    try {
      const body = {
        ...(currentDraftId ? { id: currentDraftId } : {}),
        title: title || 'Untitled flow',
        description,
        type: 'flow',
        layers: chunks,
        meta: { ...meta, project_id: meta.project_id ?? (projectChoice || null) },
      };
      const res = await fetch('/api/v1/drafts', {
        method: currentDraftId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Save failed.' });
        return null;
      }
      const savedId = data.draft?.id || currentDraftId;
      if (!currentDraftId && savedId) {
        setCurrentDraftId(savedId);
        router.replace(`/workspace/traditional?id=${savedId}`);
      }
      return savedId;
    } catch {
      setMessage({ type: 'error', text: 'Save failed.' });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    const id = await saveDraft();
    if (id) setMessage({ type: 'success', text: 'Draft saved.' });
  }

  async function publish() {
    if (problems.length) {
      setShowProblems(true);
      setMessage({ type: 'error', text: 'Fix the marked problems before publishing.' });
      return;
    }
    setPublishing(true);
    setMessage(null);
    try {
      const id = await saveDraft();
      const res = await fetch('/api/v1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: id,
          title,
          description,
          chunks,
          meta: { ...meta, project_id: meta.project_id ?? (projectChoice || null) },
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Publish failed.' });
        return;
      }
      setMessage({ type: 'success', text: 'Published on ConteXtube.', href: data.published?.url });
    } catch {
      setMessage({ type: 'error', text: 'Publish failed.' });
    } finally {
      setPublishing(false);
    }
  }

  if (status === 'loading') {
    return <div className="p-8 animate-pulse"><div className="h-8 w-64 bg-gray-200 rounded" /></div>;
  }
  if (!session) {
    return <div className="p-8 text-center text-muted"><p>Please sign in to use the editor.</p></div>;
  }

  const rights = meta.rights ?? 'own';
  const canIncludeSource = rights !== 'copyrighted' && Boolean(projectInfo?.has_source);

  return (
    <div className="p-8 max-w-4xl">
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold">{currentDraftId ? 'Edit flow' : 'New flow'}</h1>
        <div className="flex items-center gap-3">
          <button onClick={onSave} disabled={saving}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={publish} disabled={publishing || drafting}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
            {publishing ? 'Publishing…' : 'Publish to ConteXtube'}
          </button>
        </div>
      </div>

      {message && (
        <div role="status" className={`mb-6 px-4 py-3 rounded-lg text-sm border ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : message.type === 'error' ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
        }`}>
          {message.text}{' '}
          {message.href && <a href={message.href} className="underline font-medium">Open it</a>}
        </div>
      )}

      {showProblems && problems.length > 0 && (
        <ul className="mb-6 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200 list-disc pl-8 space-y-0.5">
          {problems.map((p, i) => <li key={i}>{p.message}</li>)}
        </ul>
      )}

      {/* Draft from a project */}
      <section className="mb-8 rounded-xl border border-border bg-gray-50/60 p-4">
        <h2 className="text-sm font-semibold">Draft from a project</h2>
        <p className="text-sm text-muted mt-1">
          The AI reads the project&apos;s clouds and source text and drafts all five layers. Quotes it can&apos;t find in your source are marked.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select value={projectChoice} onChange={(e) => setProjectChoice(e.target.value)} className={`${input} w-auto min-w-56`}
            aria-label="Project to draft from">
            <option value="">Items without a project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {confirmReplace ? (
            <>
              <span className="text-sm text-muted">This replaces your current layers.</span>
              <button onClick={draftFromProject} className="px-3 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover">Replace them</button>
              <button onClick={() => setConfirmReplace(false)} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-white">Keep mine</button>
            </>
          ) : (
            <button
              onClick={() => (chunks.some((c) => c.text.trim()) ? setConfirmReplace(true) : draftFromProject())}
              disabled={drafting || projectInfo?.items === 0}
              className="px-3 py-2 text-sm border border-accent text-accent rounded-lg hover:bg-accent/5 disabled:opacity-50">
              {drafting ? 'Drafting…' : 'Draft with AI'}
            </button>
          )}
          {projectInfo && (
            <span className="text-xs text-muted">
              {projectInfo.items} item{projectInfo.items === 1 ? '' : 's'}{projectInfo.has_source ? ' · source text stored' : ''}
            </span>
          )}
        </div>
      </section>

      {/* About the flow */}
      <section className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="f-title">Title</label>
          <input id="f-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The work's title, or your reading's" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="f-desc">Description</label>
          <textarea id="f-desc" className={`${input} resize-y`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="One or two sentences about the work" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="f-st">Source work</label>
            <input id="f-st" className={input} value={meta.source_title ?? ''} onChange={(e) => setMeta({ ...meta, source_title: e.target.value })}
              placeholder="e.g. The Metamorphosis" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="f-sa">Author</label>
            <input id="f-sa" className={input} value={meta.source_author ?? ''} onChange={(e) => setMeta({ ...meta, source_author: e.target.value })}
              placeholder="e.g. Franz Kafka" />
          </div>
        </div>
        <fieldset>
          <legend className="block text-sm font-medium mb-1.5">Whose text is it?</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {([['own', 'My own work'], ['public_domain', 'Public domain'], ['copyrighted', "Someone else's, under copyright"]] as [Rights, string][]).map(([v, label]) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="rights" checked={rights === v} onChange={() => setMeta({ ...meta, rights: v })} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {rights === 'copyrighted' ? (
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="f-buy">Where to buy it</label>
            <input id="f-buy" className={input} value={meta.purchase_url ?? ''} onChange={(e) => setMeta({ ...meta, purchase_url: e.target.value })}
              placeholder="https://…" />
            <p className="text-xs text-muted mt-1">ConteXtube shows a purchase link instead of the text.</p>
          </div>
        ) : (
          <label className={`flex items-center gap-2 text-sm ${canIncludeSource ? '' : 'text-muted'}`}>
            <input type="checkbox" disabled={!canIncludeSource} checked={canIncludeSource && Boolean(meta.include_source)}
              onChange={(e) => setMeta({ ...meta, include_source: e.target.checked })} />
            Publish the full source text as L5
            {!projectInfo?.has_source && <span className="text-xs">(upload the text to this project first)</span>}
          </label>
        )}
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="f-tags">Tags</label>
          <input id="f-tags" className={input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="philosophy, alienation (comma-separated)" />
        </div>
      </section>

      {/* The five layers */}
      {FLOW_LAYERS.map((L) => {
        const list = chunks.filter((c) => c.layer === L.n);
        const tokens = list.reduce((s, c) => s + estimateTokens(c.text), 0);
        const over = L.n < 5 && tokens > L.budget * Math.max(1, list.length);
        return (
          <section key={L.n} className="mb-8" aria-labelledby={`l${L.n}`}>
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2 mb-3">
              <h2 id={`l${L.n}`} className="font-semibold">
                <span className="text-accent mr-2">L{L.n}</span>{L.name}
              </h2>
              <span className={`text-xs ${over ? 'text-amber-600' : 'text-muted'}`}>
                ~{tokens} tokens · aim for ~{L.budget}{L.n === 5 ? '+' : ''} per chunk
              </span>
            </div>
            <p className="text-sm text-muted mb-3">{L.hint}</p>
            <div className="space-y-3">
              {list.map((c) => (
                <div key={c.id} className={`rounded-xl border p-4 bg-white ${problemIds.has(c.id) && showProblems ? 'border-amber-400' : 'border-border'}`}>
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-2">
                      {L.n === 5 && (
                        <select className={`${input} w-auto`} value={c.type} aria-label="Kind of L5 chunk"
                          onChange={(e) => update(c.id, { type: e.target.value as FlowChunk['type'] })}>
                          <option value="meta">Notes on how this reading was made</option>
                          <option value="narrative" disabled={rights === 'copyrighted'}>Source text</option>
                        </select>
                      )}
                      {L.n !== 5 && (
                        <input className={`${input} font-medium text-indigo-700`} value={c.extract ?? ''} aria-label="Extract"
                          onChange={(e) => update(c.id, { extract: e.target.value })}
                          placeholder={L.n === 1 ? 'Extract, up to 8 words: e.g. faithfulness∅audience' : 'Extract (optional, up to 8 words)'} />
                      )}
                      <textarea className={`${input} resize-y`} rows={L.n === 4 || L.n === 5 ? 6 : 3} value={c.text} aria-label="Text"
                        onChange={(e) => update(c.id, { text: e.target.value })} />
                      {L.n === 2 && (
                        <div>
                          <textarea className={`${input} resize-y italic ${c.quote_unverified ? 'border-amber-400 bg-amber-50/40' : ''}`} rows={2}
                            value={c.source_quote ?? ''} aria-label="Quote from the source"
                            onChange={(e) => update(c.id, { source_quote: e.target.value, quote_unverified: false })}
                            placeholder="Quote from the source, copied exactly" />
                          {c.quote_unverified && (
                            <p className="text-xs text-amber-700 mt-1">This quote wasn&apos;t found in your source. Check it word for word, or replace it.</p>
                          )}
                        </div>
                      )}
                      {L.n === 3 && (
                        <input className={input} value={(c.links ?? []).join(', ')} aria-label="Linked works"
                          onChange={(e) => update(c.id, { links: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                          placeholder="Linked works or ideas, comma-separated" />
                      )}
                    </div>
                    <button onClick={() => remove(c.id)} className="self-start p-1.5 text-muted hover:text-red-500" aria-label={`Remove this L${L.n} chunk`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => add(L.n as FlowChunk['layer'])} className="mt-3 text-sm text-accent hover:underline">
              + Add to L{L.n}
            </button>
          </section>
        );
      })}
    </div>
  );
}

export default function TraditionalEditor() {
  return (
    <Suspense fallback={<div className="p-8 animate-pulse"><div className="h-8 w-64 bg-gray-200 rounded" /></div>}>
      <FlowEditorInner />
    </Suspense>
  );
}
