'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { tr } from '@/i18n/client';
import { newIdentity, readIdentity } from '@/lib/engine/identity';
import type { Agenda, Identity } from '@/lib/engine/types';
import EffectEditor from './EffectEditor';
import IdentityEditor from './IdentityEditor';
import { download, fileName, label, field, link, primary, readJsonFile, secondary, type EngineCharacter } from './shared';

interface Draft { identity: Identity; declared: Agenda | null; real: Agenda[]; roles: Record<string, string> }

const draftOf = (c: EngineCharacter): Draft => ({
  identity: c.engine.identity ? readIdentity(c.engine.identity) : { ...newIdentity(c.title), name: c.title, summary: c.content.slice(0, 300) },
  declared: c.engine.declared ?? null,
  real: c.engine.real ?? [],
  roles: c.engine.roles ?? {},
});

/** The cast: each character's identity, agendas and old-wound roles in this story. */
export default function CastPanel({ characters, onSaved, onError }: {
  characters: EngineCharacter[];
  onSaved: (c: EngineCharacter) => void;
  onError: (text: string, settings?: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(characters[0]?.id ?? null);
  const current = characters.find((c) => c.id === selected) ?? null;
  const [draft, setDraft] = useState<Draft | null>(current ? draftOf(current) : null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'propose' | null>(null);
  const [reasoning, setReasoning] = useState('');
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { if (current) { setDraft(draftOf(current)); setDirty(false); setReasoning(''); } }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!characters.length) {
    return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted">{tr('No characters in this project yet. Add them in the Characters cloud, or make one in the')} <Link href="/workspace/character-generator" className="font-medium text-accent underline">{tr('Character Generator')}</Link>.</p>;
  }
  const people = characters.filter((c) => c.id !== selected).map((c) => ({ id: c.id, name: c.title }));
  const peopleWithSelf = characters.map((c) => ({ id: c.id, name: c.id === selected ? tr('{name} (self)', { name: c.title }) : c.title }));
  const change = (patch: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDirty(true); };

  const save = async () => {
    if (!current || !draft) return;
    setBusy('save');
    try {
      const total = draft.real.reduce((s, a) => s + a.weight, 0) || 1;
      const real = draft.real.map((a) => ({ ...a, weight: a.weight / total }));
      const res = await fetch(`/api/v1/engine/items/${current.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: { identity: draft.identity, declared: draft.declared, real, roles: draft.roles } }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onError(d.error || tr('Saving failed.')); return; }
      onSaved({ ...current, engine: d.engine });
      setDirty(false);
    } finally { setBusy(null); }
  };

  const propose = async () => {
    if (!current) return;
    if (dirty) await save();
    setBusy('propose');
    try {
      const res = await fetch('/api/v1/engine/agendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character_id: current.id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onError(d.message || d.error || tr('The AI could not propose agendas.'), d.code === 'BYOT_REQUIRED'); return; }
      change({ declared: d.declared, real: d.real ?? [], roles: { ...(draft?.roles ?? {}), ...(d.roles ?? {}) } });
      setReasoning(d.reasoning || '');
    } finally { setBusy(null); }
  };

  const importFile = async (f: File | undefined) => {
    if (!f || !draft) return;
    try { change({ identity: readIdentity(await readJsonFile(f)) }); }
    catch { onError(tr('That file is not a character file.')); }
  };

  const roles = [...new Set((draft?.identity.history ?? []).map((h) => h.targetRole).filter((r): r is string => !!r))];

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={tr('Characters')}>
        <ul className="space-y-1">
          {characters.map((c) => (
            <li key={c.id}>
              <button type="button" aria-current={c.id === selected ? 'true' : undefined} onClick={() => setSelected(c.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${c.id === selected ? 'bg-accent/10 font-medium text-foreground' : 'text-muted hover:bg-gray-50 hover:text-foreground'}`}>
                <span className="block truncate">{c.title}</span>
                <span className="block text-xs text-muted">{c.engine.identity ? (c.engine.real?.length ? tr('identity · {n} agendas', { n: c.engine.real.length }) : tr('identity, no agendas')) : tr('not set up')}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {current && draft && (
        <div className="space-y-8">
          <section aria-labelledby="h-identity" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="h-identity" className="text-sm font-semibold text-foreground">{tr('Who {name} is', { name: current.title })}</h2>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={link} onClick={() => file.current?.click()}>{tr('Import a character file')}</button>
                <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
                <button type="button" className={link} onClick={() => download(fileName(draft.identity.name), JSON.stringify(draft.identity, null, 2))}>{tr('Export as a character file')}</button>
                <Link href={`/workspace/character-generator?character=${current.id}`} className={link}>{tr('Open in the Generator')}</Link>
              </div>
            </div>
            <p className="text-xs text-muted">{tr('The portable part: it travels with the character file and never names people from this story.')}</p>
            <IdentityEditor identity={draft.identity} idPrefix={`c-${current.id}`} onChange={(identity) => change({ identity })} />
          </section>

          <section aria-labelledby="h-agendas" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="h-agendas" className="text-sm font-semibold text-foreground">{tr('What {name} wants in this story', { name: current.title })}</h2>
              <button type="button" className={secondary} disabled={!!busy} onClick={() => void propose()}>{busy === 'propose' ? tr('Proposing…') : tr('Propose from the drives')}</button>
            </div>
            {reasoning && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted">{reasoning}</p>}
            <div className="rounded-lg border border-border p-3">
              <label htmlFor="declared" className={label}>{tr('What they say they want')}</label>
              <input id="declared" value={draft.declared?.label ?? ''} maxLength={200} placeholder={tr('help the team succeed')} className={field}
                onChange={(e) => change({ declared: { id: 'declared', label: e.target.value, effect: draft.declared?.effect ?? {}, weight: 1 } })} />
              <div className="mt-2">
                <EffectEditor idPrefix="declared" people={peopleWithSelf} effect={draft.declared?.effect ?? {}} onChange={(effect) => change({ declared: { id: 'declared', label: draft.declared?.label ?? '', effect, weight: 1 } })} />
              </div>
            </div>
            {draft.real.map((a, i) => (
              <div key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`real-${i}`} className={label}>{tr('What they really want ({n})', { n: i + 1 })}</label>
                    <input id={`real-${i}`} value={a.label} maxLength={200} className={field} onChange={(e) => change({ real: draft.real.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  </div>
                  <label className="flex w-48 items-center gap-2 text-xs text-muted">
                    {tr('Weight')}
                    <input type="range" min={0.05} max={1} step={0.05} value={a.weight} className="flex-1 accent-indigo-500" onChange={(e) => change({ real: draft.real.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} />
                  </label>
                  <button type="button" className="text-xs text-muted hover:text-red-600" onClick={() => change({ real: draft.real.filter((_, j) => j !== i) })}>{tr('Remove')}</button>
                </div>
                <div className="mt-2"><EffectEditor idPrefix={`real-${i}`} people={peopleWithSelf} effect={a.effect} onChange={(effect) => change({ real: draft.real.map((x, j) => (j === i ? { ...x, effect } : x)) })} /></div>
              </div>
            ))}
            {draft.real.length < 3 && <button type="button" className={link} onClick={() => change({ real: [...draft.real, { id: `r${Date.now()}`, label: '', effect: {}, weight: 0.5 }] })}>{tr('+ Add a real agenda')}</button>}
            <p className="text-xs text-muted">{tr('Effects say who gains and who loses if the agenda comes true. Weights are shared out among the real agendas; they shift at real choices in the story.')}</p>
          </section>

          {roles.length > 0 && (
            <section aria-labelledby="h-roles" className="space-y-2">
              <h2 id="h-roles" className="text-sm font-semibold text-foreground">{tr('Who plays the roles in old wounds')}</h2>
              {roles.map((r) => (
                <label key={r} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-muted">{r}</span>
                  <select value={draft.roles[r] ?? ''} className={field} onChange={(e) => { const next = { ...draft.roles }; if (e.target.value) next[r] = e.target.value; else delete next[r]; change({ roles: next }); }}>
                    <option value="">{tr('Nobody in this story')}</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              ))}
            </section>
          )}

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-white/95 py-3">
            <button type="button" className={primary} disabled={!dirty || !!busy} onClick={() => void save()}>{busy === 'save' ? tr('Saving…') : tr('Save {name}', { name: current.title })}</button>
            {dirty && <span className="text-xs text-muted">{tr('Unsaved changes')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
