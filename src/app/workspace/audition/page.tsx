'use client';

import { tr, trFormula } from '@/i18n/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { ATOMIC_STATES, ATOMIC_STATE_MAP, describeFormula, formatFormula, stateLabel } from '@/lib/state-formula';
import { MAX_CAST, blendCast, describeAdjustments, type Adjustment, type CastMember, type CastState, type Turn } from '@/lib/audition';
import { loadStateLibrary, saveToStateLibrary, pushStateLibrary } from '@/components/graph/nodeTypes';
import StateMaker from '@/components/audition/StateMaker';
import KeepState from '@/components/audition/KeepState';
import type { LibraryState } from '@/lib/state-maker';

const LIBRARY_URL = `${(process.env.NEXT_PUBLIC_CONTEXTUBE_URL || 'https://contextube.ai').replace(/\/$/, '')}/api/v1/states?limit=1000`;
const DRAFT_KEY = 'contextcloud_audition_draft';
const field = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40';
const label = 'block text-xs font-medium text-muted mb-1';
const button = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

interface Draft { name: string; who: string; scene: string; context: string; cast: CastMember[]; adjustments: Adjustment[]; shows: string; intensity: string }

export default function AuditionPage() {
  const [library, setLibrary] = useState<CastState[] | null>(null);
  const [mine, setMine] = useState<LibraryState[]>([]);
  const [studio, setStudio] = useState<LibraryState[]>([]);
  const [pending, setPending] = useState<LibraryState[]>([]);
  const [shelf, setShelf] = useState<'all' | 'mine' | 'studio'>('all');
  const [makerOpen, setMakerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cast, setCast] = useState<CastMember[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [shows, setShows] = useState('auto');
  const [intensity, setIntensity] = useState('auto');
  const [name, setName] = useState('');
  const [who, setWho] = useState('');
  const [scene, setScene] = useState('');
  const [context, setContext] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; settings?: boolean } | null>(null);
  const [saved, setSaved] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(LIBRARY_URL).then((r) => (r.ok ? r.json() : { states: [] })).then((d) => setLibrary(Array.isArray(d.states) ? d.states : [])).catch(() => setLibrary([]));
    fetch('/api/v1/states').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setMine(d.mine ?? []); setStudio(d.studio ?? []); setPending(d.pending ?? []);
    }).catch(() => { /* the reference library still works */ });
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') as Draft | null;
      if (d) { setName(d.name ?? ''); setWho(d.who ?? ''); setScene(d.scene ?? ''); setContext(d.context ?? ''); setCast(d.cast ?? []); setAdjustments(d.adjustments ?? []); setShows(d.shows ?? 'auto'); setIntensity(d.intensity ?? 'auto'); }
    } catch { /* a draft that cannot be read is skipped */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, who, scene, context, cast, adjustments, shows, intensity } satisfies Draft)); } catch { /* storage may be unavailable */ }
  }, [name, who, scene, context, cast, adjustments, shows, intensity]);

  const blend = useMemo(
    () => blendCast(cast, adjustments, shows, intensity === 'auto' ? null : (Number(intensity) as 1 | 2 | 3)),
    [cast, adjustments, shows, intensity],
  );
  const found = useMemo(() => {
    const q = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const all: LibraryState[] = [...mine, ...studio, ...(library ?? []).map((s) => ({ ...s, source: 'contextube' as const }))];
    return all.filter((s) => shelf === 'all' || s.source === shelf).filter((s) => !cast.some((m) => m.state.id === s.id))
      .filter((s) => { const t = `${s.character} ${s.moment} ${trFormula(s.formula)} ${s.work}`.toLowerCase(); return q.every((w) => t.includes(w)); })
      .slice(0, 40);
  }, [library, mine, studio, shelf, search, cast]);

  const setAdjustment = (state: string, amount: number) =>
    setAdjustments((a) => (amount === 0 ? a.filter((x) => x.state !== state) : a.some((x) => x.state === state) ? a.map((x) => (x.state === state ? { state, amount } : x)) : [...a, { state, amount }]));

  const play = async (history: Turn[]) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/v1/audition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, who, scene, context, cast, adjustments, shows, intensity: intensity === 'auto' ? null : Number(intensity), turns: history }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError({ text: d.message || d.error || tr("The audition could not be played."), settings: d.code === 'BYOT_REQUIRED' || /model/i.test(d.details || '') }); return; }
      setTurns([...history, { role: 'character', text: d.take }]);
      setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } catch {
      setError({ text: tr("The audition could not be reached. Check your connection and try again.") });
    } finally { setBusy(false); }
  };
  const follow = (role: 'scene' | 'direction') => { const text = next.trim(); if (!text) return; setNext(''); void play([...turns, { role, text }]); };
  const ready = !!blend && scene.trim().length >= 10 && !busy;

  const castState = (s: CastState) => setCast((c) => (c.length < MAX_CAST && !c.some((m) => m.state.id === s.id) ? [...c, { state: s, weight: 50 }] : c));
  const removeMine = async (s: LibraryState) => {
    setMine((m) => m.filter((x) => x.id !== s.id));
    await fetch(`/api/v1/states/${encodeURIComponent(s.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ library: false }) }).catch(() => {});
  };
  const decide = async (s: LibraryState, review: 'approved' | 'rejected') => {
    const res = await fetch(`/api/v1/states/${encodeURIComponent(s.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review }) }).catch(() => null);
    if (!res?.ok) return;
    setPending((p) => p.filter((x) => x.id !== s.id));
    if (review === 'approved') setStudio((st) => [...st, { ...s, source: 'studio', review: 'approved' }]);
    setMine((m) => m.map((x) => (x.id === s.id ? { ...x, review } : x)));
  };
  const libraryCount = mine.length + studio.length + (library?.length ?? 0);

  const saveMix = () => {
    if (!blend) return;
    const from = cast.filter((m) => m.weight > 0).map((m, i) => `${Math.round(blend.shares[i] * 100)}% ${m.state.character} ${m.state.moment}`).join('; ');
    const all = saveToStateLibrary({ ...blend.formula, id: `custom-${Date.now()}`, name: name.trim() ? `${name.trim()}: ${trFormula(formatFormula(blend.formula))}` : formatFormula(blend.formula), description: `Mixed from ${from}.`.slice(0, 500) });
    void pushStateLibrary(all); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <div className="flex-1 p-8 w-full">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-xl font-semibold text-foreground mb-1">{tr("Audition")}</h1>
            <p className="text-sm text-muted mb-6 max-w-2xl">{tr("Cast up to three states from the library, set how much of each, and watch the AI play your character in a scene of yours. It borrows how those characters are, never who they are.")}</p>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              {/* ── The mix ── */}
              <section aria-labelledby="h-mix" className="space-y-6">
                <h2 id="h-mix" className="text-sm font-semibold text-foreground">{tr("The state")}</h2>

                <div>
                  <p className={label}>{tr("Cast (")}{cast.length}{" "}{tr("of")}{" "}{MAX_CAST})</p>
                  {cast.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted">{tr("Nobody cast yet. Pick a state from the library below.")}</p>}
                  <ul className="space-y-2">
                    {cast.map((m, i) => (
                      <li key={m.state.id} className="rounded-lg border border-border border-l-4 bg-white p-3" style={{ borderLeftColor: m.state.color || '#888' }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{m.state.character}, {m.state.moment}</p>
                            <p className="text-xs text-muted">{trFormula(m.state.formula)} · {m.state.work}</p>
                          </div>
                          <button type="button" onClick={() => setCast((c) => c.filter((x) => x.state.id !== m.state.id))} className="shrink-0 text-xs text-muted hover:text-red-600" aria-label={tr("Remove {character}, {moment}", { character: m.state.character, moment: m.state.moment })}>{tr("Remove")}</button>
                        </div>
                        <label className="mt-2 flex items-center gap-3 text-xs text-muted">
                          <span className="w-12 shrink-0">{tr("Weight")}</span>
                          <input type="range" min={0} max={100} step={5} value={m.weight} className="flex-1 accent-indigo-500"
                            onChange={(e) => setCast((c) => c.map((x) => (x.state.id === m.state.id ? { ...x, weight: Number(e.target.value) } : x)))} />
                          <span className="w-10 text-right tabular-nums text-foreground">{blend && m.weight > 0 ? `${Math.round((blend.shares[cast.filter((x) => x.weight > 0).indexOf(m)] ?? 0) * 100)}%` : '0%'}</span>
                        </label>
                        <details className="mt-1 text-xs text-muted">
                          <summary className="cursor-pointer hover:text-foreground">{tr("What this state is")}</summary>
                          <p className="mt-1">{m.state.situation}</p>
                          <p className="mt-1"><span className="font-medium">{tr("Inside:")}</span> {m.state.inside}</p>
                          <p className="mt-1"><span className="font-medium">{tr("Outside:")}</span> {m.state.outside}</p>
                        </details>
                        <span className="sr-only">{tr("Cast member")}{" "}{i + 1}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {pending.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-900">{tr("Waiting for review (")}{pending.length})</p>
                    <p className="text-xs text-amber-900/80">{tr("Offers to the Studio library. Approved states appear for every writer.")}</p>
                    <ul className="mt-2 space-y-2">
                      {pending.map((s) => (
                        <li key={s.id} className="rounded-lg border border-border border-l-4 bg-white p-3" style={{ borderLeftColor: s.color || '#888' }}>
                          <p className="text-sm font-medium text-foreground">{s.character}, {s.moment}</p>
                          <p className="text-xs text-muted">{trFormula(s.formula)} · {s.work}{s.by ? tr(" · from {by}", { by: s.by }) : ''}</p>
                          <p className="mt-1 text-xs text-foreground">{s.situation}</p>
                          <details className="mt-1 text-xs text-muted">
                            <summary className="cursor-pointer hover:text-foreground">{tr("Inside and outside")}</summary>
                            <p className="mt-1"><span className="font-medium">{tr("Inside:")}</span> {s.inside}</p>
                            <p className="mt-1"><span className="font-medium">{tr("Outside:")}</span> {s.outside}</p>
                          </details>
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => decide(s, 'approved')} className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">{tr("Approve")}</button>
                            <button type="button" onClick={() => decide(s, 'rejected')} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-gray-50">{tr("Reject")}</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {cast.length < MAX_CAST && (
                  <div>
                    <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
                      <label htmlFor="lib-search" className="block text-xs font-medium text-muted">{tr("State library")}{" "}{library ? `(${libraryCount})` : ''}</label>
                      <div role="group" aria-label={tr("Which library")} className="flex gap-1 text-xs">
                        {([['all', 'All'], ['mine', tr('My library ({n})', { n: mine.length })], ['studio', tr('Studio library ({n})', { n: studio.length })]] as const).map(([id, text]) => (
                          <button key={id} type="button" aria-pressed={shelf === id} onClick={() => setShelf(id)}
                            className={`rounded-full border px-2.5 py-0.5 ${shelf === id ? 'border-accent bg-accent text-white' : 'border-border text-muted hover:text-foreground'}`}>{tr(text)}</button>
                        ))}
                      </div>
                    </div>
                    <input id="lib-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Search a character, a cause or a feeling: alyosha, humiliated, grief")} className={field} />
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-1">
                      {!library && <li className="px-2 py-3 text-sm text-muted">{tr("Loading the library…")}</li>}
                      {library && library.length === 0 && <li className="px-2 py-3 text-sm text-muted">{tr("The state library could not be reached. Reload the page to try again.")}</li>}
                      {library && libraryCount > 0 && found.length === 0 && (
                        <li className="px-2 py-3 text-sm text-muted">
                          {shelf === 'mine' && !mine.length ? tr("Your library is empty. Make states from a story below.") : shelf === 'studio' && !studio.length ? tr("Nothing in the Studio library yet.") : search ? tr("No state matches “{search}”.", { search: search }) : tr("Every state here is already cast.")}
                        </li>
                      )}
                      {found.map((s) => (
                        <li key={`${s.source}-${s.id}`} className="flex items-stretch gap-1">
                          <button type="button" title={`${s.situation}\n\n${s.inside}`} onClick={() => castState(s)}
                            className="block min-w-0 flex-1 rounded border-l-4 px-2 py-1.5 text-left hover:bg-gray-50" style={{ borderLeftColor: s.color || '#888' }}>
                            <span className="block truncate text-sm text-foreground">{s.character}, {s.moment}</span>
                            <span className="block truncate text-xs text-muted">
                              {trFormula(s.formula)}
                              {s.source === 'mine' && <>{" "}{tr("· Mine")}{s.review === 'pending' ? tr(", waiting for review") : s.review === 'approved' ? tr(", in the Studio library") : ''}</>}
                              {s.source === 'studio' && <>{" "}{tr("· Studio library")}</>}
                            </span>
                          </button>
                          {s.source === 'mine' && (
                            <button type="button" onClick={() => removeMine(s)} className="shrink-0 rounded px-2 text-xs text-muted hover:bg-gray-50 hover:text-red-600" aria-label={tr("Remove {character}, {moment} from my library", { character: s.character, moment: s.moment })}>{tr("Remove")}</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border border-border">
                  <button type="button" aria-expanded={makerOpen} aria-controls="state-maker" onClick={() => setMakerOpen((o) => !o)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-gray-50">
                    <span>{tr("Make states from a story")}</span>
                    <span aria-hidden="true" className="text-muted">{makerOpen ? '−' : '+'}</span>
                  </button>
                  {makerOpen && (
                    <div id="state-maker" className="border-t border-border p-3">
                      <StateMaker
                        canCast={cast.length < MAX_CAST}
                        onCast={castState}
                        onSaved={(saved) => {
                          setMine((m) => [...saved.filter((x) => x.in_library), ...m]);
                        }}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <p className={label}>{tr("Adjust: turn a feeling up or down")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ATOMIC_STATES.map((s) => {
                      const a = adjustments.find((x) => x.state === s.id);
                      const on = !!a;
                      return (
                        <button key={s.id} type="button" title={tr(s.description)} aria-pressed={on}
                          onClick={() => setAdjustment(s.id, !a ? 50 : a.amount > 0 ? -50 : 0)}
                          className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                          style={on ? { background: a!.amount > 0 ? s.color : '#fff', color: a!.amount > 0 ? '#fff' : '#b91c1c', borderColor: a!.amount > 0 ? s.color : '#dc2626' } : { borderColor: 'var(--border)', color: 'var(--muted)' }}>
                          {on ? (a!.amount > 0 ? '+ ' : '− ') : ''}{tr(s.label)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-muted">{tr("Click once to add more of a feeling, again to hold it down, a third time to clear.")}</p>
                  {adjustments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {adjustments.map((a) => (
                        <li key={a.state} className="flex items-center gap-3 text-xs text-muted">
                          <span className="w-24 shrink-0 text-foreground">{a.amount > 0 ? tr("More") : tr("Less")} {tr(stateLabel(a.state))}</span>
                          <input type="range" min={10} max={100} step={10} value={Math.abs(a.amount)} aria-label={tr(a.amount > 0 ? 'How much more {state}' : 'How much less {state}', { state: tr(stateLabel(a.state)) })} className="flex-1 accent-indigo-500"
                            onChange={(e) => setAdjustment(a.state, Number(e.target.value) * Math.sign(a.amount))} />
                          <span className="w-8 text-right tabular-nums">{Math.abs(a.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="shows" className={label}>{tr("What others see")}</label>
                    <select id="shows" value={shows} onChange={(e) => setShows(e.target.value)} className={field}>
                      <option value="auto">{tr("As the cast shows it")}</option>
                      <option value="none">{tr("Exactly what is felt")}</option>
                      {ATOMIC_STATES.map((s) => <option key={s.id} value={s.id}>{tr(s.label)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="intensity" className={label}>{tr("Intensity")}</label>
                    <select id="intensity" value={intensity} onChange={(e) => setIntensity(e.target.value)} className={field}>
                      <option value="auto">{tr("As the cast has it")}</option>
                      <option value="1">{tr("An undertone")}</option>
                      <option value="2">{tr("Plain to see")}</option>
                      <option value="3">{tr("Overwhelming")}</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-gray-50 p-4" aria-live="polite">
                  <p className={label}>{tr("The mix as one formula")}</p>
                  {blend ? (
                    <>
                      <p className="text-base font-semibold text-foreground">{trFormula(formatFormula(blend.formula))}</p>
                      <ul className="mt-3 space-y-1">
                        {blend.strengths.map((s) => (
                          <li key={s.id} className="flex items-center gap-2 text-xs text-muted">
                            <span className="w-20 shrink-0 text-foreground">{s.share < 0 ? '− ' : ''}{ATOMIC_STATE_MAP[s.id]?.label}</span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                              <span className="block h-full rounded-full" style={{ width: `${Math.round(Math.abs(s.share) * 100)}%`, background: s.share < 0 ? 'repeating-linear-gradient(45deg,#9ca3af,#9ca3af 3px,#e5e7eb 3px,#e5e7eb 6px)' : ATOMIC_STATE_MAP[s.id]?.color }} />
                            </span>
                            <span className="w-8 text-right tabular-nums">{Math.round(Math.abs(s.share) * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                      {describeAdjustments(adjustments).length > 0 && <p className="mt-3 text-xs text-muted">{tr("Your adjustments:")}{" "}{describeAdjustments(adjustments).join('; ')}.</p>}
                      <details className="mt-3 text-xs text-muted">
                        <summary className="cursor-pointer hover:text-foreground">{tr("What the AI reads")}</summary>
                        <p className="mt-1 whitespace-pre-wrap">{describeFormula({ ...blend.formula, name: "" }, tr, trFormula)}</p>
                      </details>
                      <button type="button" onClick={saveMix} className={`${button} mt-3 border border-border text-foreground hover:bg-white`}>{saved ? tr("Saved to your formulas") : tr("Save just the formula")}</button>
                    </>
                  ) : (
                    <p className="text-sm text-muted">{cast.length ? tr("Give at least one cast member a weight above zero.") : tr("Cast a state to see the formula.")}</p>
                  )}
                </div>
              </section>

              {/* ── The scene ── */}
              <section aria-labelledby="h-scene" className="space-y-4">
                <h2 id="h-scene" className="text-sm font-semibold text-foreground">{tr("The scene")}</h2>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                  <div>
                    <label htmlFor="name" className={label}>{tr("Your character")}</label>
                    <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={tr("Mara")} className={field} />
                  </div>
                  <div>
                    <label htmlFor="who" className={label}>{tr("Who they are")}</label>
                    <input id="who" value={who} onChange={(e) => setWho(e.target.value)} maxLength={600} placeholder={tr("A night-shift line operator, fifteen years in")} className={field} />
                  </div>
                </div>
                <div>
                  <label htmlFor="scene" className={label}>{tr("Scene: where, who else is there, what is happening")}</label>
                  <textarea id="scene" value={scene} onChange={(e) => setScene(e.target.value)} rows={4} maxLength={2000} placeholder={tr("The break room at 3 a.m. The new manager tells her the line will be shut down in spring and asks her to help him announce it.")} className={field} />
                </div>
                <div>
                  <label htmlFor="context" className={label}>{tr("Context: what led here, what the character knows (optional)")}</label>
                  <textarea id="context" value={context} onChange={(e) => setContext(e.target.value)} rows={3} maxLength={3000} placeholder={tr("Her old supervisor died last week. Nobody at work knows how hard it hit her.")} className={field} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={!ready} onClick={() => void play([])} className={`${button} bg-accent text-white hover:bg-accent-hover`}>
                    {busy && !turns.length ? tr("Playing…") : turns.length ? tr("Start the scene again") : tr("Audition")}
                  </button>
                  {!blend && <span className="text-xs text-muted">{tr("Cast a state first.")}</span>}
                  {blend && scene.trim().length < 10 && <span className="text-xs text-muted">{tr("Describe the scene first.")}</span>}
                </div>
                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error.text} {error.settings && <Link href="/workspace/settings" className="font-medium underline">{tr("Open Settings")}</Link>}
                  </p>
                )}

                {turns.length > 0 && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <ol className="space-y-3">
                      {turns.map((t, i) => (
                        <li key={i} className={t.role === 'character' ? 'rounded-lg border border-border bg-white p-4' : 'pl-4 text-sm text-muted'}>
                          {t.role === 'character' ? (
                            <>
                              <p className="mb-1 text-xs font-medium text-muted">{name.trim() || tr("Your character")}</p>
                              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{t.text}</p>
                            </>
                          ) : (
                            <p><span className="font-medium">{t.role === 'direction' ? tr("Your direction: ") : tr("In the scene: ")}</span>{t.text}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                    {busy && <p className="text-sm text-muted" role="status">{tr("Playing…")}</p>}
                    <div ref={end} />
                    <div>
                      <label htmlFor="next" className={label}>{tr("What happens next, or a note to the actor")}</label>
                      <textarea id="next" value={next} onChange={(e) => setNext(e.target.value)} rows={2} maxLength={1000} placeholder={tr("The manager says: “They’ll take it better from you than from me.”")} className={field} />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={busy || !next.trim()} onClick={() => follow('scene')} className={`${button} bg-accent text-white hover:bg-accent-hover`}>{tr("Play on")}</button>
                        <button type="button" disabled={busy || !next.trim()} onClick={() => follow('direction')} className={`${button} border border-border text-foreground hover:bg-gray-50`}>{tr("Direct the actor")}</button>
                        <button type="button" disabled={busy} onClick={() => void play(turns)} className={`${button} border border-border text-foreground hover:bg-gray-50`}>{tr("Another take")}</button>
                      </div>
                      <p className="mt-1 text-xs text-muted">{tr("Play on: the scene continues with what you wrote. Direct the actor: the last take is played again your way. Another take: the same moment, other choices.")}</p>
                    </div>
                    {blend && !busy && turns.some((t) => t.role === 'character') && (
                      <KeepState
                        formula={blend.formula}
                        name={name}
                        scene={scene}
                        context={context}
                        take={[...turns].reverse().find((t) => t.role === 'character')?.text ?? ''}
                        onSavedToLibrary={(s) => setMine((m) => [s, ...m])}
                      />
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
