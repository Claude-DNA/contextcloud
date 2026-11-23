'use client';

import { useEffect, useState } from 'react';
import { tr } from '@/i18n/client';
import type { Deed, EventKind, StoryEvent } from '@/lib/engine/types';
import EffectEditor from './EffectEditor';
import { effectLine, label, link, primary, secondary, small, type EngineCharacter, type EngineScene, type Proposed, type SceneReading } from './shared';

const EVENT_KINDS: { id: EventKind; text: string }[] = [
  { id: 'happening', text: 'Happening (helps or blocks goals)' }, { id: 'wrong', text: 'A wrong, not acknowledged' }, { id: 'kindness', text: 'Kindness' },
  { id: 'loss', text: 'Loss' }, { id: 'apology', text: 'Apology for a wrong' }, { id: 'betrayal', text: 'Betrayal' }, { id: 'reminder', text: 'Reminder of an old wound' },
  { id: 'threat', text: 'Threat' }, { id: 'lie', text: 'A lie told to someone' }, { id: 'contact', text: 'Contact (they meet or talk)' },
];
const empty = (): SceneReading => ({ present: [], events: [], deeds: [] });

function EventCard({ ev, people, onChange, onRemove, check }: { ev: Proposed<StoryEvent>; people: { id: string; name: string }[]; onChange: (e: StoryEvent) => void; onRemove?: () => void; check?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? (id === 'world' ? tr('the world') : id);
  return (
    <li className="rounded-lg border border-border bg-white p-3 text-sm">
      <div className="flex items-start gap-2">
        {check}
        <div className="min-w-0 flex-1">
          <p className="text-foreground"><span className="text-xs text-muted">{tr(EVENT_KINDS.find((k) => k.id === ev.kind)?.text ?? ev.kind)}</span>{ev.by ? <span className="text-xs text-muted"> · {tr('by {name}', { name: name(ev.by) })}</span> : null}<br />{ev.label}</p>
          <p className="text-xs text-muted">{effectLine(ev.effect, name) || tr('no one affected yet')}{ev.confidence !== undefined ? ` · ${tr('confidence {n}%', { n: Math.round(ev.confidence * 100) })}` : ''}</p>
        </div>
        <button type="button" className={link} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? tr('Close') : tr('Edit')}</button>
        {onRemove && <button type="button" className="text-xs text-muted hover:text-red-600" onClick={onRemove}>{tr('Remove')}</button>}
      </div>
      {open && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3 text-xs sm:grid-cols-2">
          <label className="sm:col-span-2">{tr('What happens')}<input value={ev.label} maxLength={300} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...ev, label: e.target.value })} /></label>
          <label>{tr('Kind')}<select value={ev.kind} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...ev, kind: e.target.value as EventKind })}>{EVENT_KINDS.map((k) => <option key={k.id} value={k.id}>{tr(k.text)}</option>)}</select></label>
          <label>{tr('Caused by')}<select value={ev.by ?? ''} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...ev, by: e.target.value || undefined })}><option value="">{tr('No one')}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>{tr('Aimed at')}<select value={ev.target ?? ''} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...ev, target: e.target.value || undefined })}><option value="">{tr('No one in particular')}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>{tr('How big')}<input type="range" min={0} max={1} step={0.05} value={ev.size} className="mt-2 w-full accent-indigo-500" onChange={(e) => onChange({ ...ev, size: Number(e.target.value) })} /></label>
          <div className="sm:col-span-2"><p className={label}>{tr('Who gains, who loses')}</p><EffectEditor idPrefix={`ev-${ev.id}`} people={people} effect={ev.effect} onChange={(effect) => onChange({ ...ev, effect })} /></div>
        </div>
      )}
    </li>
  );
}

function DeedCard({ d, people, onChange, onRemove, check }: { d: Proposed<Deed>; people: { id: string; name: string }[]; onChange: (d: Deed) => void; onRemove?: () => void; check?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? (id === 'world' ? tr('the world') : id);
  const num = (k: keyof Deed, v: number) => onChange({ ...d, [k]: v });
  return (
    <li className="rounded-lg border border-border bg-white p-3 text-sm">
      <div className="flex items-start gap-2">
        {check}
        <div className="min-w-0 flex-1">
          <p className="text-foreground"><span className="font-medium">{name(d.actor)}</span>: {d.label}</p>
          <p className="text-xs text-muted">
            {effectLine(d.effect, name) || tr('no one affected yet')}
            {' · '}{tr('visibility {n}%', { n: Math.round(d.visibility * 100) })}
            {d.choice ? ` · ${tr('a real choice')}` : ''}{d.branch ? ` · ${tr(d.branch)}` : ''}{d.forcedBy ? ` · ${tr('pushed by {name}', { name: name(d.forcedBy) })}` : ''}
            {d.confidence !== undefined ? ` · ${tr('confidence {n}%', { n: Math.round(d.confidence * 100) })}` : ''}
          </p>
        </div>
        <button type="button" className={link} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? tr('Close') : tr('Edit')}</button>
        {onRemove && <button type="button" className="text-xs text-muted hover:text-red-600" onClick={onRemove}>{tr('Remove')}</button>}
      </div>
      {open && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3 text-xs sm:grid-cols-2">
          <label>{tr('Who acts')}<select value={d.actor} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...d, actor: e.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>{tr('What they do')}<input value={d.label} maxLength={300} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...d, label: e.target.value })} /></label>
          <label>{tr('Kind')}<select value={d.kind ?? 'act'} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...d, kind: e.target.value as Deed['kind'] })}>
            <option value="act">{tr('An act')}</option><option value="apology">{tr('An apology')}</option><option value="confession">{tr('A confession')}</option><option value="amends">{tr('Amends')}</option></select></label>
          <label>{tr('How visible to others')}<input type="range" min={0} max={1} step={0.05} value={d.visibility} className="mt-2 w-full accent-indigo-500" onChange={(e) => num('visibility', Number(e.target.value))} /></label>
          <label>{tr('Their own odds of it working')}<input type="range" min={0} max={1} step={0.05} value={d.odds ?? 0.6} className="mt-2 w-full accent-indigo-500" onChange={(e) => num('odds', Number(e.target.value))} /></label>
          <label>{tr('How much it matters to the plot')}<input type="range" min={0} max={1} step={0.05} value={d.plotWeight ?? 0.5} className="mt-2 w-full accent-indigo-500" onChange={(e) => num('plotWeight', Number(e.target.value))} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!d.choice} onChange={(e) => onChange({ ...d, choice: e.target.checked })} />{tr('A real choice between their goals')}</label>
          <label>{tr('When they saw no way to win')}<select value={d.branch ?? ''} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...d, branch: (e.target.value || undefined) as Deed['branch'] })}>
            <option value="">{tr('Not a pivot')}</option><option value="heroic">{tr('heroic')}</option><option value="despair">{tr('despair')}</option><option value="rage">{tr('rage')}</option></select></label>
          <label>{tr('Pushed by (confirmed source)')}<select value={d.forcedBy ?? ''} className={`${small} mt-1 w-full`} onChange={(e) => onChange({ ...d, forcedBy: e.target.value || undefined })}>
            <option value="">{tr('No one: their own doing')}</option>{people.filter((p) => p.id !== d.actor).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {d.forcedBy && <label>{tr('How hard they were pushed')}<input type="range" min={0} max={1} step={0.05} value={d.pressure ?? 0.5} className="mt-2 w-full accent-indigo-500" onChange={(e) => num('pressure', Number(e.target.value))} /></label>}
          <div className="sm:col-span-2"><p className={label}>{tr('Who gains, who loses')}</p><EffectEditor idPrefix={`d-${d.id}`} people={people} effect={d.effect} onChange={(effect) => onChange({ ...d, effect })} /></div>
        </div>
      )}
    </li>
  );
}

/** Scenes: the AI proposes what happens and who does what; the writer approves before the engine sees it. */
export default function ScenesPanel({ scenes, characters, onSaved, onError }: {
  scenes: EngineScene[];
  characters: EngineCharacter[];
  onSaved: (s: EngineScene) => void;
  onError: (text: string, settings?: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(scenes[0]?.id ?? null);
  const scene = scenes.find((s) => s.id === selected) ?? null;
  const [approved, setApproved] = useState<SceneReading>(scene?.engine.approved ?? empty());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [proposed, setProposed] = useState<SceneReading | null>(scene?.engine.proposed ?? null);
  const [busy, setBusy] = useState<'read' | 'save' | 'all' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [progress, setProgress] = useState('');
  const people = characters.map((c) => ({ id: c.id, name: c.title }));

  useEffect(() => {
    setApproved(scene?.engine.approved ?? empty());
    setProposed(scene?.engine.proposed ?? null);
    setPicked(new Set([...(scene?.engine.proposed?.events ?? []), ...(scene?.engine.proposed?.deeds ?? [])].filter((x) => (x.confidence ?? 1) >= 0.5).map((x) => x.id)));
    setDirty(false);
  }, [scene?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!scenes.length) return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted">{tr('No arc scenes in this project yet. The engine runs along the arc: add scenes in the Arc cloud first.')}</p>;

  const save = async (reading: SceneReading, s = scene) => {
    if (!s) return false;
    const res = await fetch(`/api/v1/engine/items/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: { approved: reading } }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { onError(d.error || tr('Saving failed.')); return false; }
    onSaved({ ...s, engine: d.engine });
    return true;
  };

  const read = async (s: EngineScene) => {
    const res = await fetch('/api/v1/engine/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene_id: s.id }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { onError(d.message || d.error || tr('The scene could not be read.'), d.code === 'BYOT_REQUIRED'); return null; }
    onSaved({ ...s, engine: { ...s.engine, proposed: d.proposed } });
    return d.proposed as SceneReading;
  };

  const readThis = async () => {
    if (!scene) return;
    setBusy('read');
    try {
      const p = await read(scene);
      if (p) { setProposed(p); setPicked(new Set([...p.events, ...p.deeds].filter((x) => (x.confidence ?? 1) >= 0.5).map((x) => x.id))); }
    } finally { setBusy(null); }
  };

  const readAll = async () => {
    setBusy('all');
    try {
      const todo = scenes.filter((s) => !s.engine.approved && !s.engine.proposed);
      for (let i = 0; i < todo.length; i++) {
        setProgress(tr('Reading scene {i} of {n}…', { i: i + 1, n: todo.length }));
        const p = await read(todo[i]);
        if (!p) break;
        if (todo[i].id === scene?.id) { setProposed(p); setPicked(new Set([...p.events, ...p.deeds].filter((x) => (x.confidence ?? 1) >= 0.5).map((x) => x.id))); }
      }
    } finally { setBusy(null); setProgress(''); }
  };

  const approvePicked = () => {
    if (!proposed) return;
    const strip = <T extends { confidence?: number }>(x: T) => { const c = { ...x }; delete c.confidence; return c; };
    const stamp = (id: string) => `${id}-${Date.now().toString(36)}`;
    setApproved((a) => ({
      present: [...new Set([...a.present, ...proposed.present])],
      events: [...a.events, ...proposed.events.filter((e) => picked.has(e.id)).map((e) => ({ ...strip(e), id: stamp(e.id) }))],
      deeds: [...a.deeds, ...proposed.deeds.filter((d) => picked.has(d.id)).map((d) => ({ ...strip(d), id: stamp(d.id) }))],
    }));
    setPicked(new Set());
    setDirty(true);
  };

  const status = (s: EngineScene) => s.engine.approved ? tr('{e} events, {d} deeds approved', { e: s.engine.approved.events.length, d: s.engine.approved.deeds.length }) : s.engine.proposed ? tr('read, waiting for you') : tr('not read yet');
  const check = (id: string) => (
    <input type="checkbox" className="mt-1" checked={picked.has(id)} aria-label={tr('Approve this')} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(id); else n.delete(id); return n; })} />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label={tr('Scenes')} className="space-y-2">
        <button type="button" className={`${secondary} w-full`} disabled={!!busy} onClick={() => void readAll()}>{busy === 'all' ? progress || tr('Reading…') : tr('Read every unread scene')}</button>
        <ol className="space-y-1">
          {scenes.map((s, i) => (
            <li key={s.id}>
              <button type="button" aria-current={s.id === selected ? 'true' : undefined} onClick={() => setSelected(s.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${s.id === selected ? 'bg-accent/10 font-medium text-foreground' : 'text-muted hover:bg-gray-50 hover:text-foreground'}`}>
                <span className="block truncate">{i + 1}. {s.title}{s.when === 'flashback' ? ` · ${tr('flashback')}` : ''}</span>
                <span className="block text-xs text-muted">{status(s)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {scene && (
        <div className="space-y-6">
          <details className="rounded-lg border border-border bg-gray-50 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">{scene.title}</summary>
            <p className="mt-2 whitespace-pre-wrap text-muted">{scene.content || tr('(no text)')}</p>
          </details>

          <section aria-labelledby="h-proposed" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="h-proposed" className="text-sm font-semibold text-foreground">{tr('What the AI reads in this scene')}</h2>
              <button type="button" className={secondary} disabled={!!busy} onClick={() => void readThis()}>{busy === 'read' ? tr('Reading…') : proposed ? tr('Read again') : tr('Read this scene')}</button>
            </div>
            {!proposed && <p className="text-sm text-muted">{tr('Not read yet. The AI proposes events and deeds; nothing reaches the engine until you approve it.')}</p>}
            {proposed && (
              <>
                <ul className="space-y-2">{proposed.events.map((ev, i) => <EventCard key={ev.id} ev={ev} people={people} check={check(ev.id)} onChange={(e) => setProposed({ ...proposed, events: proposed.events.map((x, j) => (j === i ? { ...e, confidence: x.confidence } : x)) })} />)}</ul>
                <ul className="space-y-2">{proposed.deeds.map((d, i) => <DeedCard key={d.id} d={d} people={people} check={check(d.id)} onChange={(x) => setProposed({ ...proposed, deeds: proposed.deeds.map((y, j) => (j === i ? { ...x, confidence: y.confidence } : y)) })} />)}</ul>
                {!proposed.events.length && !proposed.deeds.length && <p className="text-sm text-muted">{tr('The AI found nothing to record in this scene.')}</p>}
                <button type="button" className={secondary} disabled={!picked.size} onClick={approvePicked}>{tr('Approve the {n} checked', { n: picked.size })}</button>
              </>
            )}
          </section>

          <section aria-labelledby="h-approved" className="space-y-3">
            <h2 id="h-approved" className="text-sm font-semibold text-foreground">{tr('Approved: what the engine will use')}</h2>
            <fieldset>
              <legend className={label}>{tr('Who is in the scene')}</legend>
              <div className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <label key={p.id} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                    <input type="checkbox" checked={approved.present.includes(p.id)} onChange={(e) => { setApproved((a) => ({ ...a, present: e.target.checked ? [...a.present, p.id] : a.present.filter((x) => x !== p.id) })); setDirty(true); }} />{p.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <ul className="space-y-2">{approved.events.map((ev, i) => <EventCard key={ev.id} ev={ev} people={people} onRemove={() => { setApproved((a) => ({ ...a, events: a.events.filter((_, j) => j !== i) })); setDirty(true); }} onChange={(e) => { setApproved((a) => ({ ...a, events: a.events.map((x, j) => (j === i ? e : x)) })); setDirty(true); }} />)}</ul>
            <ul className="space-y-2">{approved.deeds.map((d, i) => <DeedCard key={d.id} d={d} people={people} onRemove={() => { setApproved((a) => ({ ...a, deeds: a.deeds.filter((_, j) => j !== i) })); setDirty(true); }} onChange={(x) => { setApproved((a) => ({ ...a, deeds: a.deeds.map((y, j) => (j === i ? x : y)) })); setDirty(true); }} />)}</ul>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={link} onClick={() => { setApproved((a) => ({ ...a, events: [...a.events, { id: `m-e${Date.now().toString(36)}`, label: '', kind: 'happening', effect: {}, size: 0.5 }] })); setDirty(true); }}>{tr('+ Add an event')}</button>
              {people.length > 0 && <button type="button" className={link} onClick={() => { setApproved((a) => ({ ...a, deeds: [...a.deeds, { id: `m-d${Date.now().toString(36)}`, actor: people[0].id, label: '', effect: {}, visibility: 0.7, plotWeight: 0.5 }] })); setDirty(true); }}>{tr('+ Add a deed')}</button>}
            </div>
            <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-white/95 py-3">
              <button type="button" className={primary} disabled={!dirty || !!busy} onClick={async () => { setBusy('save'); try { if (await save(approved)) setDirty(false); } finally { setBusy(null); } }}>{busy === 'save' ? tr('Saving…') : tr('Save the approved reading')}</button>
              {dirty && <span className="text-xs text-muted">{tr('Unsaved changes')}</span>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
