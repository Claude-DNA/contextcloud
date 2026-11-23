'use client';

import { tr } from '@/i18n/client';
import { REFERENCE_CHARACTERS, blendReferences } from '@/lib/engine/references';
import type { ReferenceWeight } from '@/lib/engine/types';
import { label, small } from './shared';

/**
 * A character's type, set the Audition way: blend up to three reference characters by weight,
 * or set the value by hand. Used for temperature (predictability) and persistence (easy-going … stubborn).
 */
export default function TypeControls({ kind, value, cast, onChange, idPrefix }: {
  kind: 'temperature' | 'persistence';
  value: number | undefined;
  cast: ReferenceWeight[] | undefined;
  onChange: (next: { value?: number; cast?: ReferenceWeight[] }) => void;
  idPrefix: string;
}) {
  const members = cast ?? [];
  const blended = blendReferences(members, kind);
  const shown = value ?? blended ?? 0.35;
  const ends = kind === 'temperature' ? [tr('Predictable (Dreiser, Picard)'), tr('Unpredictable (Dostoevsky)')] : [tr('Easy-going'), tr('Stubborn')];
  const title = kind === 'temperature' ? tr('Temperature: how predictable') : tr('Persistence: how long feelings last');
  const free = REFERENCE_CHARACTERS.filter((r) => !members.some((m) => m.reference === r.name));
  return (
    <fieldset className="space-y-2">
      <legend className={label}>{title}</legend>
      <input id={`${idPrefix}-v`} type="range" min={0} max={1} step={0.05} value={shown} aria-label={title}
        onChange={(e) => onChange({ value: Number(e.target.value), cast: members })} className="w-full accent-indigo-500" />
      <div className="flex justify-between gap-2 text-xs text-muted" aria-hidden="true"><span>{ends[0]}</span><span className="text-right">{ends[1]}</span></div>
      <p className="text-xs text-muted">
        {value !== undefined
          ? tr('Set by hand: {v}.', { v: shown.toFixed(2) })
          : blended !== null ? tr('From the cast below: {v}.', { v: blended.toFixed(2) }) : tr('Not set: the story default is used.')}
        {value !== undefined && members.length > 0 && <> <button type="button" className="font-medium text-accent hover:underline" onClick={() => onChange({ cast: members })}>{tr('Use the cast instead')}</button></>}
      </p>
      {kind === 'persistence' && (
        <select value="" className={small} aria-label={tr('Set it like a reference character')} onChange={(e) => { const r = REFERENCE_CHARACTERS.find((x) => x.name === e.target.value); if (r) onChange({ value: r.persistence }); }}>
          <option value="">{tr('Set it like…')}</option>
          {REFERENCE_CHARACTERS.map((r) => <option key={r.name} value={r.name}>{r.name} · {r.persistence.toFixed(2)}</option>)}
        </select>
      )}
      {kind === 'temperature' && (
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.reference} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0 truncate text-foreground" title={m.reference}>{m.reference}</span>
              <input type="range" min={0} max={100} step={5} value={m.weight} className="flex-1 accent-indigo-500" aria-label={tr('Weight of {name}', { name: m.reference })}
                onChange={(e) => onChange({ cast: members.map((x) => (x.reference === m.reference ? { ...x, weight: Number(e.target.value) } : x)) })} />
              <button type="button" className="text-muted hover:text-red-600" aria-label={tr('Remove {name}', { name: m.reference })} onClick={() => onChange({ cast: members.filter((x) => x.reference !== m.reference) })}>×</button>
            </div>
          ))}
          {members.length < 3 && (
            <select value="" className={small} aria-label={tr('Cast a reference character')} onChange={(e) => e.target.value && onChange({ cast: [...members, { reference: e.target.value, weight: 50 }] })}>
              <option value="">{tr('+ Cast a reference character')}</option>
              {free.map((r) => <option key={r.name} value={r.name}>{r.name} · {r.work}</option>)}
            </select>
          )}
        </div>
      )}
    </fieldset>
  );
}
