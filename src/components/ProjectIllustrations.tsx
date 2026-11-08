'use client';

import { useEffect, useRef, useState } from 'react';
import { useProject } from '@/context/ProjectContext';

/** Illustrated in this order, so characters have portraits before the scenes they appear in. */
const ORDER = ['characters', 'scenes', 'world', 'ideas', 'arc'];

interface Row { id: string; title: string; metadata?: Record<string, unknown> | null }

/**
 * Project panel: one illustration style for the whole cloud, and "Illustrate all" for every item
 * without a picture (references excepted). Runs two items at a time and can be stopped.
 */
export default function ProjectIllustrations({ onDone }: { onDone?: () => void }) {
  const { activeProjectId } = useProject();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState('');
  const [presets, setPresets] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const stop = useRef(false);

  useEffect(() => {
    if (!open || !activeProjectId) return;
    fetch(`/api/v1/projects/${activeProjectId}/illustration-style`).then((r) => r.json()).then((d) => {
      setStyle(d.style ?? '');
      setPresets(d.presets ?? []);
    });
  }, [open, activeProjectId]);

  if (!activeProjectId) return null;

  const saveStyle = async (s: string) => {
    setStyle(s);
    await fetch(`/api/v1/projects/${activeProjectId}/illustration-style`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: s }) });
  };

  const suggest = async () => {
    setBusy('Thinking of styles…');
    setMessage(null);
    const res = await fetch(`/api/v1/projects/${activeProjectId}/illustration-style`, { method: 'POST' });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) setMessage({ ok: false, text: d.message || d.error || 'Could not suggest styles' });
    else setSuggestions(d.suggestions ?? []);
  };

  const illustrateAll = async () => {
    stop.current = false;
    setMessage(null);
    await saveStyle(style);
    const queue: Row[] = [];
    let charactersMissing: Row[] = [];
    for (const t of ORDER) {
      const r = await fetch(`/api/v1/cloud-items?type=${t}&project_id=${activeProjectId}`).then((x) => x.json());
      const missing = ((r.items ?? []) as Row[]).filter((it) => !it.metadata?.image);
      if (t === 'characters') charactersMissing = missing;
      queue.push(...missing);
    }
    if (!queue.length) {
      setMessage({ ok: true, text: 'Every item already has a picture.' });
      return;
    }
    const state = { done: 0, total: queue.length, failed: [] as string[] };
    setProgress({ ...state });
    const run = async (it: Row) => {
      if (stop.current) return;
      const res = await fetch(`/api/v1/cloud-items/${it.id}/illustrate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'auto' }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        state.failed.push(`${it.title}: ${d.message || d.error || res.status}`);
        if (res.status === 402) stop.current = true;
      }
      state.done += 1;
      setProgress({ ...state });
    };
    // Two at a time; all characters finish before the rest start, so scenes can use their portraits.
    const pool = async (list: Row[]) => {
      let i = 0;
      await Promise.all(Array.from({ length: 2 }, async () => {
        while (i < list.length && !stop.current) await run(list[i++]);
      }));
    };
    const characterIds = new Set(charactersMissing.map((c) => c.id));
    await pool(queue.filter((q) => characterIds.has(q.id)));
    await pool(queue.filter((q) => !characterIds.has(q.id)));
    setMessage(state.failed.length
      ? { ok: false, text: `${state.done - state.failed.length} illustrated, ${state.failed.length} failed. ${state.failed[0]}` }
      : { ok: true, text: stop.current ? `Stopped after ${state.done}.` : `Illustrated ${state.done} items.` });
    setProgress(null);
    onDone?.();
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors">
        Illustrations
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[24rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-border bg-white p-4 shadow-lg">
          <div>
            <label htmlFor="ill-style" className="block text-xs font-medium text-foreground mb-1">Style for every illustration in this project</label>
            <textarea id="ill-style" rows={3} value={style} onChange={(e) => setStyle(e.target.value)} onBlur={() => saveStyle(style)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <label htmlFor="ill-preset" className="sr-only">Start from a preset</label>
              <select id="ill-preset" value="" onChange={(e) => e.target.value && saveStyle(e.target.value)}
                className="max-w-[14rem] rounded border border-border px-2 py-1 text-xs text-muted">
                <option value="">Start from a preset…</option>
                {presets.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="button" onClick={suggest} disabled={Boolean(busy || progress)} className="text-xs text-accent hover:underline disabled:opacity-50">Suggest styles for this work</button>
            </div>
            {suggestions.length > 0 && (
              <ul className="mt-2 space-y-1">
                {suggestions.map((s) => (
                  <li key={s}><button type="button" onClick={() => { saveStyle(s); setSuggestions([]); }} className="text-left text-xs text-foreground hover:text-accent">{s}</button></li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted">
            Illustrate all gives each item without a picture a public-domain artwork that shows it, or draws one in this style. Characters go first so scenes can reuse their faces.
          </p>
          <div className="flex items-center justify-end gap-2">
            {progress ? (
              <>
                <span className="text-xs text-muted" role="status">{progress.done} of {progress.total}</span>
                <button type="button" onClick={() => { stop.current = true; }} className="px-3 py-2 text-sm text-red-600 hover:underline">Stop</button>
              </>
            ) : (
              <button type="button" onClick={illustrateAll} disabled={Boolean(busy) || !style.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50">
                Illustrate all
              </button>
            )}
          </div>
          {busy && <p className="text-xs text-muted" role="status">{busy}</p>}
          {message && <p role="status" className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</p>}
        </div>
      )}
    </div>
  );
}
