'use client';

import { tr } from '@/i18n/client';
import { WORLD_ID } from './shared';

/**
 * Who gains and who loses: one slider per person (and the world), −1 … +1.
 * People at 0 are folded away behind "Add someone" so the editor stays short.
 */
export default function EffectEditor({ effect, onChange, people, idPrefix }: {
  effect: Record<string, number>;
  onChange: (e: Record<string, number>) => void;
  people: { id: string; name: string }[];
  idPrefix: string;
}) {
  const all = [...people, { id: WORLD_ID, name: tr('the world') }];
  const shown = all.filter((p) => effect[p.id] !== undefined);
  const hidden = all.filter((p) => effect[p.id] === undefined);
  const set = (id: string, v: number | null) => {
    const next = { ...effect };
    if (v === null) delete next[id]; else next[id] = Math.round(v * 100) / 100;
    onChange(next);
  };
  return (
    <div className="space-y-1">
      {shown.map((p) => {
        const v = effect[p.id];
        const id = `${idPrefix}-${p.id}`;
        return (
          <div key={p.id} className="flex items-center gap-2 text-xs">
            <label htmlFor={id} className="w-28 shrink-0 truncate text-foreground" title={p.name}>{p.name}</label>
            <input id={id} type="range" min={-1} max={1} step={0.05} value={v} onChange={(e) => set(p.id, Number(e.target.value))}
              className="flex-1 accent-indigo-500" aria-valuetext={v >= 0 ? tr('gains {n}', { n: v.toFixed(2) }) : tr('loses {n}', { n: Math.abs(v).toFixed(2) })} />
            <span className={`w-12 text-right tabular-nums ${v < 0 ? 'text-red-600' : v > 0 ? 'text-emerald-700' : 'text-muted'}`}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>
            <button type="button" onClick={() => set(p.id, null)} className="text-muted hover:text-red-600" aria-label={tr('Remove {name}', { name: p.name })}>×</button>
          </div>
        );
      })}
      {hidden.length > 0 && (
        <select value="" onChange={(e) => e.target.value && set(e.target.value, 0)} className="rounded-md border border-dashed border-border bg-white px-2 py-1 text-xs text-muted" aria-label={tr('Add someone this affects')}>
          <option value="">{tr('+ Add someone this affects')}</option>
          {hidden.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
    </div>
  );
}
