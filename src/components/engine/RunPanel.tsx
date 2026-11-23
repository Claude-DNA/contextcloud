'use client';

import { useMemo, useState } from 'react';
import { tr } from '@/i18n/client';
import { FEELING } from '@/lib/engine/feelings';
import type { Flag, RunResult, Settings } from '@/lib/engine/types';
import { label, link, primary, secondary, small, type EngineCharacter } from './shared';

const COLORS = ['#4f46e5', '#db2777', '#059669', '#d97706', '#0891b2', '#7c3aed', '#dc2626', '#65a30d', '#2563eb', '#9333ea'];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;

interface Run { result: RunResult; names: Record<string, string>; spread?: { character: string; good: number; love: number }[] }

/** The plane: Good–Evil up, Love–Fear across; each character's path up to the chosen scene. */
function Plane({ run, beat, ids, color }: { run: Run; beat: number; ids: string[]; color: (id: string) => string }) {
  const W = 560, H = 380, P = 40;
  const x = (v: number) => P + ((v + 1) / 2) * (W - 2 * P);
  const y = (v: number) => H - P - ((v + 1) / 2) * (H - 2 * P);
  const beats = run.result.beats.slice(0, beat + 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Each character on Good–Evil and Love–Fear, up to the chosen scene')} className="w-full rounded-lg border border-border bg-white">
      <rect x={P} y={P} width={W - 2 * P} height={(H - 2 * P) / 2} fill="#059669" fillOpacity="0.05" />
      <rect x={P} y={H / 2} width={W - 2 * P} height={(H - 2 * P) / 2} fill="#dc2626" fillOpacity="0.05" />
      <line x1={P} x2={W - P} y1={H / 2} y2={H / 2} stroke="#9ca3af" />
      <line x1={W / 2} x2={W / 2} y1={P} y2={H - P} stroke="#9ca3af" />
      <text x={W / 2 + 6} y={P - 10} fontSize="12" fill="#374151">{tr('Good')}</text>
      <text x={W / 2 + 6} y={H - P + 22} fontSize="12" fill="#374151">{tr('Evil')}</text>
      <text x={W - P} y={H / 2 - 6} fontSize="12" fill="#374151" textAnchor="end">{tr('Love')}</text>
      <text x={P} y={H / 2 - 6} fontSize="12" fill="#374151">{tr('Fear')}</text>
      {ids.map((id) => {
        const pts = beats.map((b) => b.characters[id]).filter(Boolean);
        if (!pts.length) return null;
        const last = pts[pts.length - 1];
        return (
          <g key={id}>
            <polyline points={pts.map((p) => `${x(p.love)},${y(p.good)}`).join(' ')} fill="none" stroke={color(id)} strokeWidth="1.5" strokeOpacity="0.6" />
            {pts.map((p, i) => <circle key={i} cx={x(p.love)} cy={y(p.good)} r={2} fill={color(id)} fillOpacity="0.5" />)}
            <line x1={x(last.love)} y1={y(last.good)} x2={x(last.love)} y2={y(last.shown)} stroke={color(id)} strokeDasharray="3 3" />
            <circle cx={x(last.love)} cy={y(last.shown)} r={5} fill="white" stroke={color(id)} strokeWidth="1.5"><title>{tr('{name} as others see them', { name: run.names[id] })}</title></circle>
            <circle cx={x(last.love)} cy={y(last.good)} r={6} fill={color(id)}><title>{run.names[id]}</title></circle>
            <text x={x(last.love) + 9} y={y(last.good) + 4} fontSize="12" fill="#111827">{run.names[id]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Spark({ values, others, color }: { values: number[]; others?: number[]; color: string }) {
  const W = 220, H = 44;
  const pts = (vs: number[]) => vs.map((v, i) => `${(i / Math.max(1, vs.length - 1)) * W},${H / 2 - v * (H / 2 - 3)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full" aria-hidden="true">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#e5e7eb" />
      {others && <polyline points={pts(others)} fill="none" stroke={color} strokeDasharray="3 3" strokeOpacity="0.6" />}
      <polyline points={pts(values)} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function FlagItem({ f, run, scene }: { f: Flag; run: Run; scene: string }) {
  return (
    <li className={`rounded-lg border p-3 text-sm ${f.note ? 'border-border bg-gray-50' : 'border-amber-200 bg-amber-50'}`}>
      <p className="text-xs text-muted">{scene} · {run.names[f.character] ?? f.character}{!f.note ? ` · ${tr('severity {n}', { n: pct(f.severity) })}` : ''}</p>
      <p className="text-foreground">{f.message}</p>
      {f.suggestion && <p className="mt-1 text-xs text-muted">{f.suggestion}</p>}
    </li>
  );
}

export default function RunPanel({ projectId, characters, settings, onSettings, onError }: {
  projectId: string | null;
  characters: EngineCharacter[];
  settings: Settings;
  onSettings: (s: Settings) => void;
  onError: (text: string) => void;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [beat, setBeat] = useState(0);
  const [busy, setBusy] = useState<'run' | 'spread' | null>(null);
  const [checked, setChecked] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [focus, setFocus] = useState<string>('');
  const ids = useMemo(() => characters.map((c) => c.id), [characters]);
  const color = (id: string) => COLORS[ids.indexOf(id) % COLORS.length] ?? '#6b7280';

  const go = async (seeds = 0) => {
    setBusy(seeds ? 'spread' : 'run');
    try {
      if (projectId) await fetch('/api/v1/engine', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, settings }) }).catch(() => {});
      const res = await fetch('/api/v1/engine/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, settings, seeds }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onError(d.error || tr('The engine could not run.')); return; }
      setRun(d);
      setBeat((b) => Math.min(b, d.result.beats.length - 1));
      setChecked(false);
    } finally { setBusy(null); }
  };

  const set = (patch: Partial<Settings>) => onSettings({ ...settings, ...patch });
  const result = run?.result;
  const at = result?.beats[beat];
  const sceneTitle = (i: number) => `${i + 1}. ${result?.beats[i]?.title ?? ''}`;
  const visibleFlags = (result?.flags ?? []).filter((f) => !focus || f.character === focus);
  const questions = visibleFlags.filter((f) => !f.note && f.shown);
  const waiting = visibleFlags.filter((f) => !f.note && !f.shown);
  const notes = visibleFlags.filter((f) => f.note);
  const hidden = settings.drafting && !checked;

  return (
    <div className="space-y-6">
      <section aria-labelledby="h-settings" className="rounded-lg border border-border p-4">
        <h2 id="h-settings" className="mb-3 text-sm font-semibold text-foreground">{tr('Run settings')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="seed" className={label}>{tr('Seed')}</label>
            <div className="flex gap-2">
              <input id="seed" type="number" value={settings.seed} onChange={(e) => set({ seed: Math.trunc(Number(e.target.value)) || 0 })} className={`${small} w-24`} />
              <button type="button" className={link} onClick={() => set({ seed: Math.floor(Math.random() * 100000) })}>{tr('New seed')}</button>
            </div>
            <p className="mt-1 text-xs text-muted">{tr('Same seed, same run. A new seed shows another way it could go.')}</p>
          </div>
          <div>
            <label htmlFor="story-t" className={label}>{tr('Story temperature (default for the cast)')}</label>
            <input id="story-t" type="range" min={0} max={1} step={0.05} value={settings.storyTemperature} onChange={(e) => set({ storyTemperature: Number(e.target.value) })} className="w-full accent-indigo-500" />
            <p className="text-xs text-muted">{settings.storyTemperature < 0.3 ? tr('A Dreiser world') : settings.storyTemperature > 0.65 ? tr('A Dostoevsky world') : tr('In between')}</p>
          </div>
          <div>
            <label htmlFor="alpha" className={label}>{tr('Good–Evil: deeds against agendas')}</label>
            <input id="alpha" type="range" min={0} max={1} step={0.05} value={settings.alpha} onChange={(e) => set({ alpha: Number(e.target.value) })} className="w-full accent-indigo-500" />
            <p className="text-xs text-muted">{tr('{d}% deeds, {a}% hidden agendas', { d: Math.round(settings.alpha * 100), a: Math.round((1 - settings.alpha) * 100) })}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="budget" className={label}>{tr('Questions per scene')}</label>
            <input id="budget" type="number" min={1} max={10} value={settings.flagBudget} onChange={(e) => set({ flagBudget: Math.max(1, Math.min(10, Number(e.target.value) || 3)) })} className={`${small} w-20`} />
            <label className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={settings.drafting} onChange={(e) => set({ drafting: e.target.checked })} />{tr('Drafting mode: quiet until I ask')}</label>
          </div>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">{tr('Moral weights: whose good counts how much in this story')}</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {[...characters.map((c) => ({ id: c.id, name: c.title })), { id: 'world', name: tr('the world') }].map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate">{p.name}</span>
                <input type="range" min={0} max={3} step={0.25} value={settings.moralWeights[p.id] ?? 1} onChange={(e) => set({ moralWeights: { ...settings.moralWeights, [p.id]: Number(e.target.value) } })} className="flex-1 accent-indigo-500" />
                <span className="w-8 text-right tabular-nums">{(settings.moralWeights[p.id] ?? 1).toFixed(2)}</span>
              </label>
            ))}
          </div>
        </details>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={primary} disabled={!!busy} onClick={() => void go()}>{busy === 'run' ? tr('Running…') : tr('Run the engine')}</button>
          <button type="button" className={secondary} disabled={!!busy} onClick={() => void go(10)}>{busy === 'spread' ? tr('Running 10 seeds…') : tr('Run 10 seeds and compare')}</button>
        </div>
      </section>

      {!result && <p className="text-sm text-muted">{tr('Run the engine to see where each character stands, scene by scene. It uses only the approved readings.')}</p>}

      {result && at && (
        <>
          <section aria-labelledby="h-where" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="h-where" className="text-sm font-semibold text-foreground">{tr('Where they stand')}</h2>
              <label className="flex min-w-[16rem] flex-1 items-center gap-3 text-xs text-muted">
                {tr('Scene')}
                <input type="range" min={0} max={result.beats.length - 1} value={beat} onChange={(e) => setBeat(Number(e.target.value))} className="flex-1 accent-indigo-500" aria-valuetext={sceneTitle(beat)} />
                <span className="max-w-[14rem] truncate text-foreground">{sceneTitle(beat)}</span>
              </label>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Plane run={run} beat={beat} ids={ids} color={color} />
              <div className="space-y-1 text-xs text-muted">
                <p>{tr('Filled dot: where they truly stand. Hollow dot: how others see them; the dashed line is the gap.')}</p>
                {run.spread && (
                  <div className="mt-3">
                    <p className={label}>{tr('How much the ending changes between seeds')}</p>
                    <ul className="space-y-0.5">{run.spread.map((s) => <li key={s.character}><span className="text-foreground">{run.names[s.character]}</span>: {tr('Good–Evil ±{g}, Love–Fear ±{l}', { g: s.good.toFixed(2), l: s.love.toFixed(2) })}</li>)}</ul>
                    <p className="mt-1">{tr('Small numbers: a predictable story. Large: the cast could have gone many ways.')}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="h-cast" className="space-y-3">
            <h2 id="h-cast" className="text-sm font-semibold text-foreground">{tr('The cast at “{scene}”', { scene: at.title })}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {ids.map((id) => {
                const s = at.characters[id];
                if (!s) return null;
                return (
                  <article key={id} className="rounded-lg border border-border border-l-4 bg-white p-4 text-sm" style={{ borderLeftColor: color(id) }}>
                    <header className="flex items-baseline justify-between gap-2">
                      <h3 className="font-medium text-foreground">{run.names[id]}</h3>
                      <span className="text-xs text-muted">{s.present ? tr('in this scene') : tr('not in this scene')}</span>
                    </header>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <dt className="text-muted">{tr('Good–Evil')}</dt><dd className="text-right tabular-nums text-foreground">{signed(s.good)}</dd>
                      <dt className="text-muted">{tr('As others see them')}</dt><dd className="text-right tabular-nums text-foreground">{signed(s.shown)}</dd>
                      <dt className="text-muted">{tr('Self-image')}</dt><dd className="text-right tabular-nums text-foreground">{signed(s.selfImage)}</dd>
                      <dt className="text-muted">{tr('Love–Fear')}</dt><dd className="text-right tabular-nums text-foreground">{signed(s.love)}</dd>
                      <dt className="text-muted">{tr('Honesty')}</dt><dd className="text-right tabular-nums text-foreground">{pct(s.honesty)}</dd>
                      <dt className="text-muted">{tr('Inner conflict')}</dt><dd className="text-right tabular-nums text-foreground">{pct(s.conflict)}</dd>
                      <dt className="text-muted">{tr('Temperature')}</dt><dd className="text-right tabular-nums text-foreground">{s.temperature.toFixed(2)}</dd>
                    </dl>
                    <p className="mt-2 text-xs text-muted">{tr('Deception {a} · visible hypocrisy {b} · self-betrayal {c}', { a: pct(s.deception), b: pct(s.hypocrisy), c: pct(s.selfBetrayal) })}</p>
                    <div className="mt-2">
                      <p className="text-xs text-muted">{tr('Good–Evil over the story (dashed: as others see it)')}</p>
                      <Spark color={color(id)} values={result.beats.map((b) => b.characters[id]?.good ?? 0)} others={result.beats.map((b) => b.characters[id]?.shown ?? 0)} />
                    </div>
                    {s.feelings.length > 0 && (
                      <p className="mt-2 text-xs"><span className="text-muted">{tr('Feeling now:')} </span>
                        {s.feelings.slice(0, 5).map((f) => `${tr(FEELING[f.id]?.label ?? f.id)}${f.target ? ` → ${run.names[f.target] ?? f.target}` : ''} ${pct(f.value)}`).join(', ')}</p>
                    )}
                    {s.ledger.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-muted">{tr('Carried (bar: how hot now; line: how unresolved)')}</p>
                        <ul className="mt-1 space-y-1">
                          {s.ledger.slice(0, 6).map((b) => (
                            <li key={`${b.feeling}-${b.target}`} className="text-xs">
                              <span className="text-foreground">{tr(FEELING[b.feeling]?.label ?? b.feeling)}{b.target !== '*' ? ` → ${run.names[b.target] ?? b.target}` : ''}</span>
                              <span className="relative mt-0.5 block h-2 rounded-full bg-gray-100">
                                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(b.intensity), background: color(id), opacity: 0.6 }} />
                                <span className="absolute -top-0.5 h-3 w-0.5 bg-gray-800" style={{ left: pct(b.significance) }} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Object.keys(s.trust).length > 0 && <p className="mt-2 text-xs text-muted">{tr('Trusted by:')} {Object.entries(s.trust).map(([j, v]) => `${run.names[j] ?? j} ${pct(v)}`).join(', ')}</p>}
                  </article>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="h-flags" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="h-flags" className="text-sm font-semibold text-foreground">{tr('Questions for the writer')}</h2>
              <select value={focus} onChange={(e) => setFocus(e.target.value)} className={small} aria-label={tr('Whose questions')}>
                <option value="">{tr('Everyone')}</option>
                {ids.map((id) => <option key={id} value={id}>{run.names[id]}</option>)}
              </select>
            </div>
            {hidden ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
                {tr('Drafting mode is on, so the engine stays quiet.')} <button type="button" className={link} onClick={() => setChecked(true)}>{tr('Check the story now')}</button>
              </div>
            ) : (
              <>
                {!questions.length && <p className="text-sm text-muted">{tr('Nothing strains plausibility enough to ask about.')}</p>}
                <ul className="space-y-2">{questions.map((f, i) => <FlagItem key={i} f={f} run={run} scene={sceneTitle(f.beat)} />)}</ul>
                {waiting.length > 0 && (
                  <div>
                    <button type="button" className={link} aria-expanded={showAll} onClick={() => setShowAll((x) => !x)}>{showAll ? tr('Hide the less pressing questions') : tr('{n} less pressing questions are waiting', { n: waiting.length })}</button>
                    {showAll && <ul className="mt-2 space-y-2">{waiting.map((f, i) => <FlagItem key={i} f={f} run={run} scene={sceneTitle(f.beat)} />)}</ul>}
                  </div>
                )}
                {notes.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">{tr('Notes ({n}): ambiguous deeds, avoidance, leaks', { n: notes.length })}</summary>
                    <ul className="mt-2 space-y-2">{notes.map((f, i) => <FlagItem key={i} f={f} run={run} scene={sceneTitle(f.beat)} />)}</ul>
                  </details>
                )}
              </>
            )}
          </section>

          <details className="text-sm">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">{tr('Every deed and its chance')}</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted"><tr><th className="py-1 pr-3">{tr('Scene')}</th><th className="pr-3">{tr('Who')}</th><th className="pr-3">{tr('Deed')}</th><th className="pr-3 text-right">{tr('Chance')}</th><th className="pr-3 text-right">{tr('Motivation ÷ cost')}</th><th>{tr('Serves')}</th></tr></thead>
                <tbody>
                  {result.deeds.map((d) => (
                    <tr key={`${d.beat}-${d.deed}`} className="border-t border-border">
                      <td className="py-1 pr-3 text-muted">{d.beat + 1}</td>
                      <td className="pr-3">{run.names[d.actor]}</td>
                      <td className="pr-3">{d.label}</td>
                      <td className={`pr-3 text-right tabular-nums ${d.chance < 0.1 ? 'text-red-600' : ''}`}>{pct(d.chance)}</td>
                      <td className="pr-3 text-right tabular-nums">{d.ratio.toFixed(2)}</td>
                      <td className="text-muted">{d.ambiguous ? tr('ambiguous') : characters.find((c) => c.id === d.actor)?.engine.real?.find((a) => a.id === d.served)?.label ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
