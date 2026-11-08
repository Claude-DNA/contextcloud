'use client';

import { useState } from 'react';

export interface ItemImage { url: string; alt?: string; credit?: string; source?: string; kind?: 'generated' | 'public_domain' | 'upload' }
interface Candidate { id: string; source: string; title: string; creator: string; date: string; thumb: string; full: string; page: string; credit: string }

/**
 * An item's illustration: the picture and its credit, and the ways to get one.
 * "Illustrate" finds a fitting public-domain artwork or draws one in the project's style;
 * "Draw a new one" always draws; "Choose a public-domain picture" lets the author pick.
 */
export default function ItemIllustration({ itemId, title, image, onChange, compact = false }: {
  itemId: string; title: string; image?: ItemImage | null; onChange: (img: ItemImage | null) => void; compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ visual: string; candidates: Candidate[] } | null>(null);

  const call = async (label: string, url: string, init: RequestInit) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || d.error || 'Something went wrong');
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const illustrate = async (mode: 'auto' | 'generate') => {
    const d = await call(mode === 'auto' ? 'Illustrating…' : 'Drawing…', `/api/v1/cloud-items/${itemId}/illustrate`, { method: 'POST', body: JSON.stringify({ mode }) });
    if (d?.image) onChange(d.image);
  };
  const findPublicDomain = async () => {
    const d = await call('Searching collections…', `/api/v1/cloud-items/${itemId}/illustrate/candidates`, { method: 'POST', body: '{}' });
    if (d) setPicker({ visual: d.visual, candidates: d.candidates ?? [] });
  };
  const pick = async (c: Candidate) => {
    const d = await call('Saving…', `/api/v1/cloud-items/${itemId}/illustrate/pick`, { method: 'POST', body: JSON.stringify({ candidate: c, alt: picker?.visual }) });
    if (d?.image) { onChange(d.image); setPicker(null); }
  };
  const remove = async () => {
    const d = await call('Removing…', `/api/v1/cloud-items/${itemId}/illustrate`, { method: 'DELETE' });
    if (d) onChange(null);
  };

  const btn = 'text-xs text-accent hover:underline disabled:opacity-50 disabled:no-underline';
  return (
    <div className="space-y-2">
      {image?.url && (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt || title} className={`w-full rounded-lg object-cover bg-gray-100 ${compact ? 'max-h-40' : 'aspect-[3/2]'}`} loading="lazy" />
          {image.credit && (
            <figcaption className="mt-1 text-[11px] text-muted">
              {image.kind === 'generated' ? 'Generated. ' : ''}{image.credit}{' '}
              {image.source && <a href={image.source} target="_blank" rel="noopener noreferrer" className="hover:underline">Source</a>}
            </figcaption>
          )}
        </figure>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {busy ? (
          <span className="text-xs text-muted" role="status">{busy}</span>
        ) : image?.url ? (
          <>
            <button type="button" className={btn} onClick={() => illustrate('generate')}>Draw a new one</button>
            <button type="button" className={btn} onClick={findPublicDomain}>Choose a public-domain picture</button>
            <button type="button" className="text-xs text-red-600 hover:underline" onClick={remove}>Remove picture</button>
          </>
        ) : (
          <>
            <button type="button" className={btn} onClick={() => illustrate('auto')}>Illustrate</button>
            <button type="button" className={btn} onClick={findPublicDomain}>Choose a public-domain picture</button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby={`pick-${itemId}`}
          onClick={(e) => { if (e.target === e.currentTarget) setPicker(null); }}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 id={`pick-${itemId}`} className="font-semibold text-foreground">Public-domain pictures for “{title}”</h2>
                {picker.visual && <p className="mt-1 text-sm text-muted">Looking for: {picker.visual}</p>}
              </div>
              <button type="button" onClick={() => setPicker(null)} className="text-sm text-muted hover:text-foreground">Close</button>
            </div>
            {picker.candidates.length === 0 ? (
              <p className="text-sm text-muted">Nothing found in The Met, the Art Institute of Chicago or NASA. Use Illustrate to draw one instead.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {picker.candidates.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c)} disabled={Boolean(busy)}
                      className="group block w-full overflow-hidden rounded-lg border border-border text-left hover:border-accent disabled:opacity-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.thumb} alt={c.title} className="aspect-[4/3] w-full object-cover bg-gray-100" loading="lazy" />
                      <span className="block p-2 text-xs text-foreground line-clamp-2">{c.title}</span>
                      <span className="block px-2 pb-2 text-[11px] text-muted line-clamp-1">{[c.creator, c.date].filter(Boolean).join(', ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {busy && <p className="mt-3 text-sm text-muted" role="status">{busy}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
