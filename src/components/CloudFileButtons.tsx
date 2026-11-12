'use client';

import { useRef, useState } from 'react';
import { useProject } from '@/context/ProjectContext';

/**
 * "Save cloud file" downloads the selected project's whole cloud as one .cloud.json file;
 * "Open cloud file" makes a new project from such a file. No AI is used either way.
 */
export default function CloudFileButtons() {
  const { activeProjectId, setActiveProjectId, refreshProjects } = useProject();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const open = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      if (file.size > 8_000_000) throw new Error('This file is larger than 8 MB, so it is not a cloud file.');
      const res = await fetch('/api/v1/import/cloud-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'The file could not be opened.');
      await refreshProjects();
      setActiveProjectId(d.project.id);
      setMessage({ ok: true, text: `Opened "${d.project.title}" as a new project: ${d.imported} items.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const button = 'px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap';
  return (
    <div className="relative flex items-center gap-3">
      {activeProjectId && (
        <a href={`/api/v1/projects/${activeProjectId}/cloud-file`} className={button}>Save cloud file</a>
      )}
      <button type="button" className={button} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Opening…' : 'Open cloud file'}
      </button>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" aria-label="Cloud file to open"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); }} />
      {message && (
        <p role="status" className={`absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-border bg-white p-3 text-sm shadow ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
