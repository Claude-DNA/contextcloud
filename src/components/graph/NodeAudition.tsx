'use client';

import { tr, trFormula } from '@/i18n/client';
import { useEffect, useMemo, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { StateFormula } from '@/lib/state-formula';
import { formatFormula } from '@/lib/state-formula';
import { castFromFormula, type Turn } from '@/lib/audition';
import { fromFormula } from '@/lib/state-arc';

/**
 * Audition from a state node: the scene comes from the scene node it belongs to, the character from
 * its character node and cloud item. After a take the state can be pinned to the character in that
 * scene (saved to the cloud) or kept in the writer's library.
 */

interface Props { node: Node; nodes: Node[]; edges: Edge[]; formula: StateFormula | null }

const title = (n?: Node) => String(n?.data?.title ?? '').trim();
const text = (n?: Node) => String(n?.data?.content ?? '').trim();
const typeOf = (n?: Node) => String(n?.data?.type ?? n?.type ?? '');
const stateText = (s: string) => s.replace(/\n?Delta:[\s\S]*$/, '').trim();
const beatOf = (sceneTitle: string) => sceneTitle.replace(/^(Flashback|Flash-forward):\s*/i, '').trim();

/** The scene node and character this state belongs to: from the ids graph building gives, or by following edges. */
function findContext(node: Node, nodes: Node[], edges: Edge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const m = node.id.match(/^(statein|stateout)_([^_]+)_([^_]+)$/);
  let scene = m ? byId.get(`scene_${m[3]}`) : undefined;
  let characterId = m?.[2] ?? null;
  let characterNode = m ? nodes.find((n) => n.id.startsWith(`proxy_${m[2]}_`)) : undefined;
  if (!scene || !characterNode) {
    // Nodes a writer drew by hand: look two steps along the edges.
    const near = (id: string) => edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : []));
    const seen = new Set([node.id]);
    let ring = [node.id];
    for (let step = 0; step < 2 && (!scene || !characterNode); step++) {
      ring = ring.flatMap(near).filter((id) => !seen.has(id) && (seen.add(id), true));
      for (const id of ring) {
        const n = byId.get(id);
        if (!scene && typeOf(n) === 'scene') scene = n;
        if (!characterNode && /^character/.test(typeOf(n))) characterNode = n;
      }
    }
    if (!characterId && characterNode) characterId = characterNode.id.match(/^(?:proxy|cloud)_([^_]+)/)?.[1] ?? null;
  }
  // What the character brings into the scene: the node of theirs that feeds it (their state after an earlier scene).
  const feeding = m && scene ? edges.find((e) => e.target === scene!.id && e.source !== node.id && (e.source.startsWith(`stateout_${m[2]}_`) || e.source.startsWith(`statein_${m[2]}_`))) : undefined;
  const entering = feeding ? byId.get(feeding.source) : undefined;
  const name = title(characterNode) || title(node).replace(/\s+(entering|after\b.*)$/i, '');
  return { scene, characterId, name, card: text(characterNode), entering: m?.[1] === 'stateout' ? entering : undefined, kind: m?.[1] === 'statein' ? 'entering' : 'after' };
}

const btn = 'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export default function NodeAudition({ node, nodes, edges, formula }: Props) {
  const ctx = useMemo(() => findContext(node, nodes, edges), [node, nodes, edges]);
  const [who, setWho] = useState('');
  const [scene, setScene] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [direction, setDirection] = useState('');
  const [busy, setBusy] = useState<'take' | 'cloud' | 'library' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // The scene text follows the graph until the writer edits it here.
  useEffect(() => { setScene(ctx.scene ? `${title(ctx.scene)}\n${text(ctx.scene)}`.slice(0, 2000) : ''); setTurns([]); setNote(null); }, [ctx.scene, node.id]);
  // Who the character is: their card in the Characters cloud.
  useEffect(() => {
    setWho(ctx.card.slice(0, 600));
    if (!ctx.characterId) return;
    let live = true;
    fetch(`/api/v1/cloud-items/${ctx.characterId}/state-arc`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (live && d?.content) setWho(String(d.content).slice(0, 600));
    }).catch(() => {});
    return () => { live = false; };
  }, [ctx.characterId, ctx.card]);

  const sceneTitle = ctx.scene ? beatOf(title(ctx.scene)) : '';
  const state = stateText(text(node));
  const lastTake = [...turns].reverse().find((t) => t.role === 'character')?.text ?? '';

  const play = async (history: Turn[]) => {
    if (!formula) return;
    setBusy('take'); setNote(null);
    try {
      const member = castFromFormula(formula, { id: node.id, character: ctx.name || 'the character', moment: sceneTitle ? `in "${sceneTitle}"` : 'in this scene', situation: scene, inside: state });
      const context = [ctx.entering && `Coming into the scene: ${stateText(text(ctx.entering))}`, state && `${ctx.kind === 'entering' ? 'As the scene opens' : 'By the end of the scene'}: ${state}`].filter(Boolean).join('\n');
      const res = await fetch('/api/v1/audition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ctx.name, who, scene, context, cast: [{ state: member, weight: 100 }], shows: 'auto', intensity: null, turns: history }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNote({ ok: false, text: d.message || d.error || tr("The audition could not be played.") }); return; }
      setTurns([...history, { role: 'character', text: d.take }]);
    } catch {
      setNote({ ok: false, text: tr("Studio could not be reached. Check your connection and try again.") });
    } finally { setBusy(null); }
  };

  const saveToCloud = async () => {
    if (!formula || !ctx.characterId || !sceneTitle) return;
    setBusy('cloud'); setNote(null);
    const res = await fetch(`/api/v1/cloud-items/${ctx.characterId}/state-arc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beat: sceneTitle, state, formula: fromFormula(formula), audition: lastTake.slice(0, 600) }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(null);
    setNote(res?.ok ? { ok: true, text: tr("Saved to {name}'s arc in the Characters cloud, pinned to \"{sceneTitle}\". Building the graph again keeps it.", { name: ctx.name, sceneTitle: sceneTitle }) } : { ok: false, text: d?.error || tr("The state could not be saved.") });
  };

  const saveToLibrary = async () => {
    if (!formula) return;
    setBusy('library'); setNote(null);
    const s = castFromFormula(formula, { id: node.id, character: ctx.name || 'My character', moment: sceneTitle ? `in "${sceneTitle}"` : 'in a scene of mine', work: 'my story', situation: scene.slice(0, 600), inside: state, outside: lastTake.slice(0, 600) });
    const res = await fetch('/api/v1/states', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ states: [{ state: s, library: true, submit: false }] }) }).catch(() => null);
    setBusy(null);
    setNote(res?.ok ? { ok: true, text: tr("Added to My Library. It is there in Audition and in every state node.") } : { ok: false, text: tr("The state could not be saved.") });
  };

  return (
    <section aria-labelledby={`aud-${node.id}`} className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-3">
      <div>
        <h3 id={`aud-${node.id}`} className="text-sm font-semibold text-gray-800">{tr("Audition this state")}</h3>
        <p className="text-xs text-gray-500">
          {formula ? <>{tr("The AI plays {name} as", { name: ctx.name || tr('the character') })}{" "}<span className="font-medium text-gray-700">{trFormula(formatFormula(formula))}</span>{sceneTitle ? <>{" "}{tr("in “{scene}”", { scene: sceneTitle })}</> : ''}.</> : tr("Set a formula above first.")}
        </p>
      </div>
      {!ctx.scene && <p className="text-xs text-amber-700">{tr("This state is not connected to a scene. Describe the scene below, or connect it to a scene node.")}</p>}
      <details className="text-xs text-gray-500" open={!ctx.scene}>
        <summary className="cursor-pointer hover:text-gray-700">{tr("What the actor is given")}</summary>
        <label className="mt-2 block font-medium text-gray-600" htmlFor={`aud-who-${node.id}`}>{tr("Who")}{" "}{ctx.name || 'they'} {ctx.name ? 'is' : 'are'}</label>
        <textarea id={`aud-who-${node.id}`} value={who} onChange={(e) => setWho(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        <label className="mt-2 block font-medium text-gray-600" htmlFor={`aud-scene-${node.id}`}>{tr("The scene")}</label>
        <textarea id={`aud-scene-${node.id}`} value={scene} onChange={(e) => setScene(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </details>

      <button type="button" disabled={!formula || scene.trim().length < 10 || !!busy} onClick={() => play([])} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
        {busy === 'take' && !turns.length ? tr("Playing…") : turns.length ? tr("Start over") : tr("Audition")}
      </button>

      {turns.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {turns.map((t, i) => (
            <p key={i} className={t.role === 'character' ? 'whitespace-pre-wrap rounded-lg bg-indigo-50 px-3 py-2 text-sm text-gray-800' : 'text-xs italic text-gray-500'}>
              {t.role === 'direction' ? tr("Direction: {text}", { text: t.text }) : t.text}
            </p>
          ))}
          <div className="flex gap-2">
            <input value={direction} onChange={(e) => setDirection(e.target.value)} placeholder={tr("Direct the actor: quieter, he hides the fear…")} aria-label={tr("Direction for the next take")}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            <button type="button" disabled={!!busy} className={`${btn} border border-gray-200 text-gray-700 hover:bg-gray-50`}
              onClick={() => { const t = direction.trim(); setDirection(''); void play(t ? [...turns, { role: 'direction' as const, text: t }] : turns); }}>
              {busy === 'take' ? tr("Playing…") : direction.trim() ? tr("Play as directed") : tr("Another take")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-2">
            <button type="button" disabled={!!busy || !ctx.characterId || !sceneTitle} onClick={saveToCloud} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
              title={!ctx.characterId ? tr("This node is not linked to a character in your clouds") : undefined}>
              {busy === 'cloud' ? tr("Saving…") : tr("Save state to the cloud")}
            </button>
            <button type="button" disabled={!!busy} onClick={saveToLibrary} className={`${btn} border border-gray-200 text-gray-700 hover:bg-gray-50`}>
              {busy === 'library' ? tr("Saving…") : tr("Add to My Library")}
            </button>
          </div>
        </div>
      )}
      {note && <p role="status" className={`text-xs ${note.ok ? 'text-emerald-700' : 'text-red-600'}`}>{tr(note.text)}</p>}
    </section>
  );
}
