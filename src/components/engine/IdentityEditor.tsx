'use client';

import { tr } from '@/i18n/client';
import { CARRIED, FEELING } from '@/lib/engine/feelings';
import type { Identity } from '@/lib/engine/types';
import TypeControls from './TypeControls';
import { field, label, small } from './shared';

const Slider = ({ id, text, value, min = 0, max = 1, ends, onChange }: { id: string; text: string; value: number; min?: number; max?: number; ends: [string, string]; onChange: (v: number) => void }) => (
  <div>
    <label htmlFor={id} className={label}>{text}</label>
    <input id={id} type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-indigo-500" />
    <div className="flex justify-between gap-2 text-xs text-muted" aria-hidden="true"><span>{ends[0]}</span><span className="text-right">{ends[1]}</span></div>
  </div>
);

/** Edits a portable identity: who the character is in any story. */
export default function IdentityEditor({ identity, onChange, idPrefix = 'id' }: { identity: Identity; onChange: (i: Identity) => void; idPrefix?: string }) {
  const set = (patch: Partial<Identity>) => onChange({ ...identity, ...patch });
  const overrides = Object.entries(identity.persistence).filter(([k]) => k !== 'overall');
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <label htmlFor={`${idPrefix}-name`} className={label}>{tr('Name')}</label>
          <input id={`${idPrefix}-name`} value={identity.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} className={field} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-summary`} className={label}>{tr('In one line')}</label>
          <input id={`${idPrefix}-summary`} value={identity.summary ?? ''} maxLength={600} onChange={(e) => set({ summary: e.target.value })} className={field} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className={label}>{tr('Core drives')}</legend>
          <ul className="space-y-1">
            {identity.drives.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <input value={d.drive} maxLength={60} aria-label={tr('Drive')} onChange={(e) => set({ drives: identity.drives.map((x, j) => (j === i ? { ...x, drive: e.target.value } : x)) })} className={`${small} w-32`} />
                <input type="range" min={0} max={1} step={0.05} value={d.weight} aria-label={tr('Weight of {name}', { name: d.drive })} onChange={(e) => set({ drives: identity.drives.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} className="flex-1 accent-indigo-500" />
                <button type="button" className="text-muted hover:text-red-600" aria-label={tr('Remove {name}', { name: d.drive })} onClick={() => set({ drives: identity.drives.filter((_, j) => j !== i) })}>×</button>
              </li>
            ))}
          </ul>
          {identity.drives.length < 8 && <button type="button" className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => set({ drives: [...identity.drives, { drive: '', weight: 0.4 }] })}>{tr('+ Add a drive')}</button>}
        </fieldset>
        <fieldset>
          <legend className={label}>{tr('Fears')}</legend>
          <ul className="space-y-1">
            {identity.fears.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <input value={d.fear} maxLength={60} aria-label={tr('Fear')} onChange={(e) => set({ fears: identity.fears.map((x, j) => (j === i ? { ...x, fear: e.target.value } : x)) })} className={`${small} w-32`} />
                <input type="range" min={0} max={1} step={0.05} value={d.weight} aria-label={tr('Weight of {name}', { name: d.fear })} onChange={(e) => set({ fears: identity.fears.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} className="flex-1 accent-indigo-500" />
                <button type="button" className="text-muted hover:text-red-600" aria-label={tr('Remove {name}', { name: d.fear })} onClick={() => set({ fears: identity.fears.filter((_, j) => j !== i) })}>×</button>
              </li>
            ))}
          </ul>
          {identity.fears.length < 6 && <button type="button" className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => set({ fears: [...identity.fears, { fear: '', weight: 0.4 }] })}>{tr('+ Add a fear')}</button>}
        </fieldset>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-values`} className={label}>{tr('Values (comma-separated)')}</label>
        <input id={`${idPrefix}-values`} value={identity.values.join(', ')} onChange={(e) => set({ values: e.target.value.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 8) })} className={field} />
      </div>

      {identity.contradictions.length > 0 && (
        <div>
          <p className={label}>{tr('Tensions')}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
            {identity.contradictions.map((c, i) => <li key={i}>{c.between[0]} ↔ {c.between[1]}{c.note ? <span className="text-muted">: {c.note}</span> : null}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Slider id={`${idPrefix}-conscience`} text={tr('Conscience')} value={identity.conscience} ends={[tr('none'), tr('strict')]} onChange={(v) => set({ conscience: v })} />
        <Slider id={`${idPrefix}-self`} text={tr('Self-image')} value={identity.selfImage} min={-1} ends={[tr('I am bad'), tr('I am good')]} onChange={(v) => set({ selfImage: v })} />
        <Slider id={`${idPrefix}-control`} text={tr('Self-control')} value={identity.selfControl} ends={[tr('shows all'), tr('hides all')]} onChange={(v) => set({ selfControl: v })} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TypeControls kind="temperature" idPrefix={`${idPrefix}-t`} value={identity.temperature.value} cast={identity.temperature.cast}
          onChange={(n) => set({ temperature: { ...(n.value !== undefined ? { value: n.value } : {}), ...(n.cast?.length ? { cast: n.cast } : {}) } })} />
        <div className="space-y-2">
          <TypeControls kind="persistence" idPrefix={`${idPrefix}-p`} value={identity.persistence.overall} cast={undefined}
            onChange={(n) => n.value !== undefined && set({ persistence: { ...identity.persistence, overall: n.value } })} />
          <div className="space-y-1">
            {overrides.map(([f, v]) => (
              <div key={f} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-foreground">{tr(FEELING[f]?.label ?? f)}</span>
                <input type="range" min={0} max={1} step={0.05} value={v} aria-label={tr('Persistence of {feeling}', { feeling: tr(FEELING[f]?.label ?? f) })}
                  onChange={(e) => set({ persistence: { ...identity.persistence, [f]: Number(e.target.value) } })} className="flex-1 accent-indigo-500" />
                <button type="button" className="text-muted hover:text-red-600" aria-label={tr('Remove {name}', { name: tr(FEELING[f]?.label ?? f) })}
                  onClick={() => { const p = { ...identity.persistence }; delete p[f]; set({ persistence: p }); }}>×</button>
              </div>
            ))}
            <select value="" className={small} aria-label={tr('Different for one feeling')} onChange={(e) => e.target.value && set({ persistence: { ...identity.persistence, [e.target.value]: identity.persistence.overall } })}>
              <option value="">{tr('+ Different for one feeling')}</option>
              {CARRIED.filter((f) => !(f in identity.persistence)).map((f) => <option key={f} value={f}>{tr(FEELING[f].label)}</option>)}
            </select>
          </div>
        </div>
      </div>

      <fieldset>
        <legend className={label}>{tr('Old wounds')}</legend>
        <ul className="space-y-2">
          {identity.history.map((h, i) => (
            <li key={i} className="grid gap-2 rounded-lg border border-border p-2 text-xs sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input value={h.wound} maxLength={300} aria-label={tr('What happened')} placeholder={tr('What happened')} onChange={(e) => set({ history: identity.history.map((x, j) => (j === i ? { ...x, wound: e.target.value } : x)) })} className={small} />
              <select value={h.feeling} aria-label={tr('What it left')} onChange={(e) => set({ history: identity.history.map((x, j) => (j === i ? { ...x, feeling: e.target.value } : x)) })} className={small}>
                {CARRIED.map((f) => <option key={f} value={f}>{tr(FEELING[f].label)}</option>)}
              </select>
              <input value={h.targetRole ?? ''} maxLength={60} aria-label={tr('Role of the person (optional)')} placeholder={tr('role: father')} onChange={(e) => set({ history: identity.history.map((x, j) => (j === i ? { ...x, targetRole: e.target.value || undefined } : x)) })} className={small} />
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={1} step={0.05} value={h.significance} aria-label={tr('How unresolved')} onChange={(e) => set({ history: identity.history.map((x, j) => (j === i ? { ...x, significance: Number(e.target.value) } : x)) })} className="w-20 accent-indigo-500" />
                <button type="button" className="text-muted hover:text-red-600" aria-label={tr('Remove this wound')} onClick={() => set({ history: identity.history.filter((_, j) => j !== i) })}>×</button>
              </div>
            </li>
          ))}
        </ul>
        {identity.history.length < 8 && <button type="button" className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => set({ history: [...identity.history, { wound: '', feeling: 'resentment', significance: 0.5 }] })}>{tr('+ Add an old wound')}</button>}
      </fieldset>
    </div>
  );
}
