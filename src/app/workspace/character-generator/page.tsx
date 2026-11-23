'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { tr } from '@/i18n/client';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useProject } from '@/context/ProjectContext';
import IdentityEditor from '@/components/engine/IdentityEditor';
import Sandbox from '@/components/engine/Sandbox';
import { download, field, fileName, label, primary, readJsonFile, secondary, small, type EngineCharacter } from '@/components/engine/shared';
import { readIdentity } from '@/lib/engine/identity';
import type { Identity } from '@/lib/engine/types';

type Mode = 'generate' | 'interview' | 'extract' | 'file';
interface QA { question: string; answer: string }
const DRAFT_KEY = 'contextcloud_generator_draft';

function Generator() {
  const params = useSearchParams();
  const { activeProjectId, projectReady } = useProject();
  const [mode, setMode] = useState<Mode>('generate');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState<QA[]>([]);
  const [question, setQuestion] = useState<{ question: string; options: string[] } | null>(null);
  const [answer, setAnswer] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; settings?: boolean } | null>(null);
  const [cast, setCast] = useState<EngineCharacter[]>([]);
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const textFile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (d?.identity) setIdentity(readIdentity(d.identity)); } catch { /* no draft */ }
  }, []);
  useEffect(() => { try { if (identity) localStorage.setItem(DRAFT_KEY, JSON.stringify({ identity })); } catch { /* storage may be unavailable */ } }, [identity]);

  useEffect(() => {
    if (!projectReady) return;
    fetch(`/api/v1/engine${activeProjectId ? `?project_id=${activeProjectId}` : ''}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const list: EngineCharacter[] = d?.characters ?? [];
      setCast(list);
      const wanted = params.get('character');
      const c = wanted ? list.find((x) => x.id === wanted) : undefined;
      if (c) { setTarget(c.id); setIdentity(c.engine.identity ? readIdentity(c.engine.identity) : readIdentity({ name: c.title, summary: c.content.slice(0, 300) })); }
    }).catch(() => {});
  }, [projectReady, activeProjectId, params]);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/v1/engine/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError({ text: d.message || d.error || tr('The Character Generator failed.'), settings: d.code === 'BYOT_REQUIRED' }); return null; }
      return d;
    } finally { setBusy(false); }
  };

  const generate = async () => { const d = await call({ mode: 'generate', description }); if (d?.character) setIdentity(d.character); };
  const extract = async () => { const d = await call({ mode: 'extract', name, text }); if (d?.character) setIdentity(d.character); };
  const interview = async (list: QA[]) => {
    const d = await call({ mode: 'interview', description, answers: list });
    if (!d) return;
    if (d.character) { setIdentity(d.character); setQuestion(null); }
    else setQuestion({ question: d.question, options: d.options ?? [] });
  };
  const reply = (a: string) => {
    if (!question || !a.trim()) return;
    const list = [...answers, { question: question.question, answer: a.trim() }];
    setAnswers(list); setAnswer(''); void interview(list);
  };

  const saveNew = async () => {
    if (!identity) return;
    setBusy(true); setSaved('');
    try {
      const res = await fetch('/api/v1/cloud-items', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloud_type: 'characters', title: identity.name, content: identity.summary ?? '', metadata: { engine: { identity } }, project_id: activeProjectId || undefined }) });
      if (!res.ok) { setError({ text: tr('Saving failed.') }); return; }
      setSaved(tr('{name} is now in the Characters cloud.', { name: identity.name }));
    } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!identity || !target) return;
    setBusy(true); setSaved('');
    try {
      const res = await fetch(`/api/v1/engine/items/${target}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: { identity } }) });
      if (!res.ok) { setError({ text: tr('Saving failed.') }); return; }
      setSaved(tr('Saved to {name}. Their agendas in the story are unchanged.', { name: cast.find((c) => c.id === target)?.title ?? '' }));
    } finally { setBusy(false); }
  };

  const modes: { id: Mode; text: string }[] = [
    { id: 'generate', text: tr('Generate') }, { id: 'interview', text: tr('Interview') }, { id: 'extract', text: tr('Extract from a text') }, { id: 'file', text: tr('Open a file') },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-xl font-semibold text-foreground">{tr('Character Generator')}</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted">{tr('Creates a character’s potential: drives, fears, tensions, how predictable they are and how long their feelings last. The result is a portable character file you can import into any story. The story decides what happens to them; the Character Engine follows the consequences.')}</p>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.text} {error.settings && <Link href="/workspace/settings" className="font-medium underline">{tr('Open Settings')}</Link>}
        </p>
      )}

      <div role="tablist" aria-label={tr('How to create')} className="mb-4 flex flex-wrap gap-2">
        {modes.map((m) => (
          <button key={m.id} role="tab" type="button" aria-selected={mode === m.id} onClick={() => setMode(m.id)}
            className={`rounded-full border px-3 py-1 text-sm ${mode === m.id ? 'border-accent bg-accent text-white' : 'border-border text-muted hover:text-foreground'}`}>{m.text}</button>
        ))}
      </div>

      <section className="mb-8 space-y-3 rounded-lg border border-border p-4" aria-label={tr('Input')}>
        {(mode === 'generate' || mode === 'interview') && (
          <div>
            <label htmlFor="desc" className={label}>{tr('Your idea, in a sentence or two')}</label>
            <textarea id="desc" rows={3} value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} className={field}
              placeholder={tr('A fundamentally decent man who slowly becomes a tyrant because he believes only he can save the city.')} />
          </div>
        )}
        {mode === 'generate' && <button type="button" className={primary} disabled={busy || !description.trim()} onClick={() => void generate()}>{busy ? tr('Creating…') : tr('Generate the character')}</button>}

        {mode === 'interview' && (
          <div className="space-y-3">
            {answers.length > 0 && (
              <ol className="space-y-2 text-sm">
                {answers.map((a, i) => <li key={i}><p className="text-muted">{a.question}</p><p className="text-foreground">{a.answer}</p></li>)}
              </ol>
            )}
            {question ? (
              <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                <p className="text-sm font-medium text-foreground">{question.question}</p>
                <div className="flex flex-wrap gap-2">{question.options.map((o) => <button key={o} type="button" disabled={busy} className={secondary} onClick={() => reply(o)}>{o}</button>)}</div>
                <div className="flex gap-2">
                  <input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reply(answer)} placeholder={tr('Or answer in your own words')} aria-label={tr('Your answer')} className={field} />
                  <button type="button" className={primary} disabled={busy || !answer.trim()} onClick={() => reply(answer)}>{tr('Answer')}</button>
                </div>
                <button type="button" className="text-xs text-muted hover:text-foreground" disabled={busy} onClick={() => { void call({ mode: 'interview', description, answers, finish: true }).then((d) => { if (d?.character) { setIdentity(d.character); setQuestion(null); } }); }}>{tr('Enough questions: finish the character')}</button>
              </div>
            ) : (
              <button type="button" className={primary} disabled={busy || !description.trim()} onClick={() => { setAnswers([]); void interview([]); }}>{busy ? tr('Thinking…') : answers.length ? tr('Start a new interview') : tr('Start the interview')}</button>
            )}
            {busy && <p className="text-xs text-muted" role="status">{tr('Thinking…')}</p>}
          </div>
        )}

        {mode === 'extract' && (
          <div className="space-y-3">
            <div>
              <label htmlFor="ex-name" className={label}>{tr('Which character')}</label>
              <input id="ex-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={field} placeholder={tr('Rodion Raskolnikov')} />
            </div>
            <div>
              <div className="flex items-end justify-between"><label htmlFor="ex-text" className={label}>{tr('The text (a chapter or more)')}</label>
                <button type="button" className="mb-1 text-xs font-medium text-accent hover:underline" onClick={() => textFile.current?.click()}>{tr('Load a .txt file')}</button></div>
              <input ref={textFile} type="file" accept=".txt,.md,text/plain" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f && f.size < 2_000_000) setText((await f.text()).slice(0, 20000)); e.target.value = ''; }} />
              <textarea id="ex-text" rows={8} value={text} onChange={(e) => setText(e.target.value.slice(0, 20000))} className={field} />
              <p className="mt-1 text-xs text-muted">{tr('{n} of 20,000 characters', { n: text.length.toLocaleString() })}</p>
            </div>
            <button type="button" className={primary} disabled={busy || !name.trim() || !text.trim()} onClick={() => void extract()}>{busy ? tr('Reading…') : tr('Extract the character')}</button>
          </div>
        )}

        {mode === 'file' && (
          <div className="space-y-2">
            <p className="text-sm text-muted">{tr('Open a .character.json file made here or by another tool that follows the format.')}</p>
            <button type="button" className={secondary} onClick={() => file.current?.click()}>{tr('Choose a file')}</button>
            <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setIdentity(readIdentity(await readJsonFile(f))); setError(null); } catch { setError({ text: tr('That file is not a character file.') }); } }} />
          </div>
        )}
      </section>

      {identity && (
        <div className="space-y-8">
          <section aria-labelledby="h-char" className="space-y-3">
            <h2 id="h-char" className="text-sm font-semibold text-foreground">{tr('The character')}</h2>
            <IdentityEditor identity={identity} onChange={setIdentity} idPrefix="gen" />
          </section>

          <section aria-labelledby="h-test" className="space-y-3">
            <h2 id="h-test" className="text-sm font-semibold text-foreground">{tr('Try them in a situation')}</h2>
            <Sandbox identity={identity} />
          </section>

          <section aria-labelledby="h-keep" className="space-y-3 border-t border-border pt-4">
            <h2 id="h-keep" className="text-sm font-semibold text-foreground">{tr('Keep it')}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={secondary} onClick={() => download(fileName(identity.name), JSON.stringify(identity, null, 2))}>{tr('Download the character file')}</button>
              <button type="button" className={primary} disabled={busy} onClick={() => void saveNew()}>{tr('Add to this project as a new character')}</button>
              {cast.length > 0 && (
                <span className="flex items-center gap-2">
                  <select value={target} onChange={(e) => setTarget(e.target.value)} className={small} aria-label={tr('Existing character')}>
                    <option value="">{tr('Or save into an existing character…')}</option>
                    {cast.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <button type="button" className={secondary} disabled={busy || !target} onClick={() => void apply()}>{tr('Save into them')}</button>
                </span>
              )}
            </div>
            {saved && <p role="status" className="text-sm text-emerald-700">{saved} <Link href="/workspace/engine" className="font-medium underline">{tr('Open the Character Engine')}</Link></p>}
          </section>
        </div>
      )}
    </div>
  );
}

export default function CharacterGeneratorPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-60 flex flex-1 flex-col">
        <Header />
        <div className="w-full flex-1 p-8">
          <Suspense fallback={<p className="text-sm text-muted">{tr('Loading…')}</p>}><Generator /></Suspense>
        </div>
      </main>
    </div>
  );
}
