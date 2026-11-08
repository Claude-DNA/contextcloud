'use client';

import { useState } from 'react';
import { useProject } from '@/context/ProjectContext';

const TUBE = 'https://contextube.ai';

/**
 * "Publish cloud": puts the selected project's cloud on ConteXtube at /cloud/<slug>, where readers
 * browse it and AIs take it in with Copy for AI. Publishing again updates the same page.
 */
export default function PublishCloud() {
  const { activeProjectId, projects, refreshProjects } = useProject();
  const project = projects.find((p) => p.id === activeProjectId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  if (!project) return null;
  const published = project.cloud_slug ? `${TUBE}/cloud/${project.cloud_slug}` : null;

  const start = () => {
    setTitle(project.title);
    setDescription(project.description ?? '');
    setResult(null);
    setOpen(true);
  };

  const publish = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/v1/publish-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, title: title.trim(), description: description.trim(), genre: genre.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Publishing failed');
      setResult({ ok: true, text: `Published: ${d.published.element_count} elements.`, url: d.published.url });
      await refreshProjects();
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-3">
        {published && !open && (
          <a href={published} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline whitespace-nowrap">View on ConteXtube</a>
        )}
        <button type="button" onClick={open ? () => setOpen(false) : start}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
          aria-expanded={open}>
          {published ? 'Publish cloud again' : 'Publish cloud'}
        </button>
      </div>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-border bg-white p-4 shadow-lg">
          <p className="text-sm text-muted">
            Puts this project&apos;s cloud on ConteXtube: plot, characters, places, world, ideas and references, with their quotes and images.
            {published ? ' This updates the page already there.' : ''}
          </p>
          <div>
            <label htmlFor="pc-title" className="block text-xs font-medium text-foreground mb-1">Title</label>
            <input id="pc-title" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label htmlFor="pc-desc" className="block text-xs font-medium text-foreground mb-1">Description</label>
            <textarea id="pc-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="One or two sentences about the work"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label htmlFor="pc-genre" className="block text-xs font-medium text-foreground mb-1">Genre</label>
            <input id="pc-genre" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. Science Fiction"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
            <button type="button" onClick={publish} disabled={busy || !title.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50">
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
          {result && (
            <p role="status" className={`text-sm ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              {result.text}{' '}
              {result.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Open it</a>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
