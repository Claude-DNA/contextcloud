'use client';

import { tr, trFormula } from '@/i18n/client';
import { useEffect, useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { describeFormula, formatFormula, type StateFormula } from '@/lib/state-formula';
import { castFromFormula } from '@/lib/audition';
import { fromFormula } from '@/lib/state-arc';
import type { LibraryState } from '@/lib/state-maker';

/**
 * After an audition: keep the state that played. Save it to My Library for later, or use it in a scene
 * of a project, where it is pinned to a character (saved in the Characters cloud, kept by graph builds,
 * and shown on the scene's state node).
 */

const field = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40';
const label = 'block text-xs font-medium text-muted mb-1';
const button = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

interface Props { formula: StateFormula; name: string; scene: string; context: string; take: string; onSavedToLibrary: (s: LibraryState) => void }
interface Scene { id: string; title: string; sort_order?: number }
interface Character { id: string; title: string }

export default function KeepState({ formula, name, scene, context, take, onSavedToLibrary }: Props) {
  const { projects, activeProjectId } = useProject();
  const [mode, setMode] = useState<'library' | 'scene'>('library');
  const [moment, setMoment] = useState('');
  const [work, setWork] = useState('');
  const [projectId, setProjectId] = useState(activeProjectId ?? '');
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [sceneId, setSceneId] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (!projectId && activeProjectId) setProjectId(activeProjectId); }, [activeProjectId, projectId]);
  useEffect(() => { if (!work) setWork(projects.find((p) => p.id === (projectId || activeProjectId))?.title ?? ''); }, [projects, projectId, activeProjectId, work]);

  // The chosen project's scenes and characters.
  useEffect(() => {
    if (mode !== 'scene' || !projectId) return;
    let live = true;
    setScenes(null); setCharacters(null); setSceneId(''); setCharacterId('');
    Promise.all([
      fetch(`/api/v1/arc-scenes?project_id=${projectId}`).then((r) => (r.ok ? r.json() : { scenes: [] })).catch(() => ({ scenes: [] })),
      fetch(`/api/v1/cloud-items?type=characters&project_id=${projectId}`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    ]).then(([s, c]) => {
      if (!live) return;
      const sc = (s.scenes ?? []) as Scene[];
      const ch = (c.items ?? []) as Character[];
      setScenes(sc); setCharacters(ch);
      const match = ch.find((x) => name.trim() && (x.title.toLowerCase().includes(name.trim().toLowerCase()) || name.trim().toLowerCase().includes(x.title.toLowerCase())));
      if (match) setCharacterId(match.id);
    });
    return () => { live = false; };
  }, [mode, projectId, name]);

  const saveToLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setNote(null);
    const s = castFromFormula(formula, { id: 'x', character: name.trim() || 'My character', moment: moment.trim(), work: work.trim() || 'my story', situation: scene, inside: context, outside: take });
    const res = await fetch('/api/v1/states', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ states: [{ state: s, library: true, submit: false }] }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok || !d?.saved?.length) { setNote({ ok: false, text: d?.error || tr("The state could not be saved.") }); return; }
    onSavedToLibrary(d.saved[0]);
    setNote({ ok: true, text: tr("Added to My Library. Find it here in the library and in every state node of the Visual Editor.") });
  };

  const useInScene = async (e: React.FormEvent) => {
    e.preventDefault();
    const sc = scenes?.find((x) => x.id === sceneId);
    const ch = characters?.find((x) => x.id === characterId);
    if (!sc || !ch) return;
    setBusy(true); setNote(null);
    const res = await fetch(`/api/v1/cloud-items/${ch.id}/state-arc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beat: sc.title, state: context.trim() || describeFormula({ ...formula, name: '' }, tr, trFormula).split('\n').slice(1, 4).join(' ').slice(0, 400), formula: fromFormula(formula), audition: take.slice(0, 600) }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setNote({ ok: false, text: d?.error || tr("The state could not be saved.") }); return; }
    // The graph kept in this browser shows it at once on the scene's state node, if that node is there.
    try {
      const key = `contextcloud_graph:${projectId}`;
      const g = JSON.parse(localStorage.getItem(key) || 'null') as { nodes?: { id: string; data: Record<string, unknown> }[] } | null;
      const n = g?.nodes?.find((x) => x.id === `stateout_${ch.id}_${sc.id}`);
      if (g && n) { n.data.stateFormula = formula; n.data.stateColor = formula.color; localStorage.setItem(key, JSON.stringify(g)); }
    } catch { /* the cloud has it either way */ }
    setNote({ ok: true, text: tr("Pinned to {title} in “{title2}”, saved in the Characters cloud. The Visual Editor shows it on that scene's state node, and building the graph again keeps it.", { title: ch.title, title2: sc.title }) });
  };

  return (
    <div className="rounded-lg border border-border bg-gray-50 p-4">
      <p className="text-sm font-semibold text-foreground">{tr("Keep this state")}</p>
      <p className="mb-3 text-xs text-muted">{trFormula(formatFormula(formula))}{tr(": what you just auditioned.")}</p>
      <div role="group" aria-label={tr("Where to keep it")} className="mb-3 flex gap-1 text-xs">
        {([['library', 'Save to My Library'], ['scene', 'Use in a scene']] as const).map(([id, text]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => { setMode(id); setNote(null); }}
            className={`rounded-full border px-3 py-1 ${mode === id ? 'border-accent bg-accent text-white' : 'border-border bg-white text-muted hover:text-foreground'}`}>{tr(text)}</button>
        ))}
      </div>

      {mode === 'library' ? (
        <form onSubmit={saveToLibrary} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="keep-moment" className={label}>{tr("When it happens")}</label>
              <input id="keep-moment" required minLength={3} value={moment} onChange={(e) => setMoment(e.target.value)} placeholder={tr("after the shutdown is announced")} className={field} />
            </div>
            <div>
              <label htmlFor="keep-work" className={label}>{tr("Story")}</label>
              <input id="keep-work" value={work} onChange={(e) => setWork(e.target.value)} placeholder={tr("Your story's title")} className={field} />
            </div>
          </div>
          <button type="submit" disabled={busy} className={`${button} bg-accent text-white hover:bg-accent-hover`}>{busy ? tr("Saving…") : tr("Save to My Library")}</button>
        </form>
      ) : (
        <form onSubmit={useInScene} className="space-y-3">
          <div>
            <label htmlFor="keep-project" className={label}>{tr("Project")}</label>
            <select id="keep-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={field}>
              <option value="" disabled>{tr("Choose a project")}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          {projectId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="keep-scene" className={label}>{tr("Scene")}</label>
                <select id="keep-scene" required value={sceneId} onChange={(e) => setSceneId(e.target.value)} className={field} disabled={!scenes}>
                  <option value="" disabled>{!scenes ? tr("Loading…") : scenes.length ? tr("Choose a scene") : tr("No scenes in this project")}</option>
                  {scenes?.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="keep-char" className={label}>{tr("Character")}</label>
                <select id="keep-char" required value={characterId} onChange={(e) => setCharacterId(e.target.value)} className={field} disabled={!characters}>
                  <option value="" disabled>{!characters ? tr("Loading…") : characters.length ? tr("Choose a character") : tr("No characters in this project")}</option>
                  {characters?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
            </div>
          )}
          <button type="submit" disabled={busy || !sceneId || !characterId} className={`${button} bg-accent text-white hover:bg-accent-hover`}>{busy ? tr("Saving…") : tr("Use in this scene")}</button>
        </form>
      )}
      {note && <p role="status" className={`mt-3 text-sm ${note.ok ? 'text-green-800' : 'text-red-700'}`}>{tr(note.text)}</p>}
    </div>
  );
}
