'use client';

import { useState } from 'react';
import type { LibraryState } from '@/lib/state-maker';

/**
 * Make states from a story: the writer names a story, a character and what others see the character do;
 * the AI proposes states at moments of the story. Each option can go to the writer's library, to the
 * Studio library for review, or straight into the cast.
 */

const field = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40';
const label = 'block text-xs font-medium text-muted mb-1';
const button = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

interface Option { state: LibraryState; library: boolean; submit: boolean }

export default function StateMaker({ onSaved, onCast, canCast }: { onSaved: (saved: LibraryState[]) => void; onCast: (s: LibraryState) => void; canCast: boolean }) {
  const [work, setWork] = useState('');
  const [character, setCharacter] = useState('');
  const [motivation, setMotivation] = useState('');
  const [busy, setBusy] = useState<'find' | 'save' | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('find'); setError(''); setDone(''); setNote(''); setOptions([]);
    try {
      const res = await fetch('/api/v1/states/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ work, character, motivation }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || d.error || 'The states could not be made.'); return; }
      setNote(d.note || (d.known ? '' : 'The AI does not know this story or character well enough to place moments in it. Try the full title, or add the author or year.'));
      setOptions((d.options as LibraryState[]).map((state) => ({ state, library: true, submit: true })));
    } catch {
      setError('Studio could not be reached. Check your connection and try again.');
    } finally { setBusy(null); }
  };

  const set = (i: number, patch: Partial<Option>) => setOptions((o) => o.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const chosen = options.filter((o) => o.library || o.submit);

  const save = async () => {
    setBusy('save'); setError('');
    try {
      const res = await fetch('/api/v1/states', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ states: chosen }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || d.error || 'The states could not be saved.'); return; }
      const saved = d.saved as LibraryState[];
      onSaved(saved);
      const kept = chosen.filter((o) => o.library).length;
      const sent = chosen.filter((o) => o.submit).length;
      setDone([kept && `${kept} added to your library`, sent && `${sent} sent to the Studio library for review`].filter(Boolean).join('; ') + '.');
      setOptions([]); setNote('');
    } catch {
      setError('Studio could not be reached. Check your connection and try again.');
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={find} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mk-work" className={label}>Story</label>
            <input id="mk-work" value={work} onChange={(e) => setWork(e.target.value)} required minLength={2} placeholder="A book, film, series or play" className={field} />
          </div>
          <div>
            <label htmlFor="mk-char" className={label}>Character</label>
            <input id="mk-char" value={character} onChange={(e) => setCharacter(e.target.value)} required minLength={2} placeholder="Their name in the story" className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="mk-motive" className={label}>Motivation: what others see</label>
          <input id="mk-motive" value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="Calm and polite, while he is plotting to take the company" className={field} />
          <p className="mt-1 text-xs text-muted">Optional. How the character comes across, or what seems to drive them. Studio looks for moments where it shows.</p>
        </div>
        <button type="submit" disabled={!!busy} className={`${button} bg-accent text-white hover:bg-accent-hover`}>
          {busy === 'find' ? 'Finding states…' : options.length ? 'Find other states' : 'Find states'}
        </button>
      </form>

      <div aria-live="polite" className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {done && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{done}</p>}
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>

      {options.length > 0 && (
        <div className="space-y-3">
          <ul className="space-y-2">
            {options.map((o, i) => (
              <li key={o.state.id + i} className="rounded-lg border border-border border-l-4 bg-white p-3" style={{ borderLeftColor: o.state.color || '#888' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{o.state.character}, {o.state.moment}</p>
                    <p className="text-xs text-muted">{o.state.formula} · {o.state.work}</p>
                  </div>
                  {canCast && (
                    <button type="button" onClick={() => onCast(o.state)} className="shrink-0 text-xs font-medium text-accent hover:underline">Cast now</button>
                  )}
                </div>
                <p className="mt-2 text-xs text-foreground">{o.state.situation}</p>
                <details className="mt-1 text-xs text-muted">
                  <summary className="cursor-pointer hover:text-foreground">Inside and outside</summary>
                  <p className="mt-1"><span className="font-medium">Inside:</span> {o.state.inside}</p>
                  <p className="mt-1"><span className="font-medium">Outside:</span> {o.state.outside}</p>
                </details>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={o.library} onChange={(e) => set(i, { library: e.target.checked })} className="accent-indigo-500" />
                    Add to My Library
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={o.submit} onChange={(e) => set(i, { submit: e.target.checked })} className="accent-indigo-500" />
                    Submit to Studio Library
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={!!busy || chosen.length === 0} className={`${button} bg-accent text-white hover:bg-accent-hover`}>
              {busy === 'save' ? 'Saving…' : chosen.length === 0 ? 'Nothing ticked' : `Save ${chosen.length} ${chosen.length === 1 ? 'state' : 'states'}`}
            </button>
            <p className="text-xs text-muted">The AI writes from what it knows of the story; check each state before you keep it. Studio Library states are reviewed before every writer can use them.</p>
          </div>
        </div>
      )}
    </div>
  );
}
