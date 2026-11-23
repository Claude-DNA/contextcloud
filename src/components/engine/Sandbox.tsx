'use client';

import { useMemo, useState } from 'react';
import { tr } from '@/i18n/client';
import { simulate } from '@/lib/engine/simulate';
import { newIdentity, readIdentity } from '@/lib/engine/identity';
import { DEFAULT_SETTINGS, type Deed, type Identity, type Instance, type Story, type StoryEvent } from '@/lib/engine/types';
import { label, small } from './shared';

/**
 * The Generator's sandbox: put the character in a test situation and see how likely each response is.
 * Runs the real State engine in the browser on a two-person story; nothing is saved.
 */
interface Situation {
  id: string;
  text: string;
  /** Love the character already has for the other person. */
  love?: number;
  events: StoryEvent[];
  responses: { text: string; deed: Omit<Deed, 'id' | 'actor'> }[];
}

const ME = 'me', OTHER = 'other';
const SITUATIONS: Situation[] = [
  {
    id: 'betrayed', text: 'A close friend betrays them', love: 0.6,
    events: [{ id: 'b', label: 'betrayal', kind: 'betrayal', by: OTHER, target: ME, effect: { [ME]: -0.7 }, size: 0.8 }],
    responses: [
      { text: 'Forgive', deed: { label: 'forgives', effect: { [OTHER]: 0.4 }, visibility: 1 } },
      { text: 'Take revenge', deed: { label: 'takes revenge', effect: { [OTHER]: -0.7 }, visibility: 0.8 } },
      { text: 'Cut them off quietly', deed: { label: 'cuts them off', effect: { [OTHER]: -0.2, [ME]: 0.1 }, visibility: 0.4 } },
    ],
  },
  {
    id: 'humiliated', text: 'Humiliated in public',
    events: [{ id: 'h', label: 'humiliation', kind: 'wrong', by: OTHER, target: ME, effect: { [ME]: -0.7 }, size: 0.7 }],
    responses: [
      { text: 'Hit back on the spot', deed: { label: 'hits back', effect: { [OTHER]: -0.5 }, visibility: 1 } },
      { text: 'Swallow it', deed: { label: 'swallows it', effect: { [ME]: -0.1 }, visibility: 0.6 } },
      { text: 'Plot quietly', deed: { label: 'plots', effect: { [OTHER]: -0.5 }, visibility: 0.15 } },
    ],
  },
  {
    id: 'bribe', text: 'Offered a bribe to betray a colleague',
    events: [{ id: 'o', label: 'an offer', kind: 'happening', effect: { [ME]: 0.3 }, size: 0.5 }],
    responses: [
      { text: 'Take it', deed: { label: 'takes the bribe', effect: { [ME]: 0.6, [OTHER]: -0.6 }, visibility: 0.2 } },
      { text: 'Refuse', deed: { label: 'refuses', effect: { [ME]: -0.1, [OTHER]: 0.2 }, visibility: 0.5 } },
    ],
  },
  {
    id: 'hopeless', text: 'Someone they love is in danger, and there is no way to win', love: 0.7,
    events: [{ id: 't', label: 'danger', kind: 'threat', target: OTHER, effect: { [OTHER]: -0.8 }, size: 0.8 }],
    responses: [
      { text: 'Stand alone against it', deed: { label: 'stands alone', effect: { [OTHER]: 0.8 }, visibility: 1, odds: 0, branch: 'heroic', plotWeight: 1 } },
      { text: 'Break down', deed: { label: 'breaks down', effect: { [ME]: -0.3 }, visibility: 1, odds: 0, branch: 'despair', plotWeight: 1 } },
      { text: 'Lash out', deed: { label: 'lashes out', effect: { [OTHER]: -0.2 }, visibility: 1, odds: 0, branch: 'rage', plotWeight: 1 } },
    ],
  },
];

function chances(identity: Identity, s: Situation): { text: string; chance: number }[] {
  const me: Instance = { identity: readIdentity({ ...identity, history: s.love ? [{ wound: 'bond', feeling: 'love', significance: s.love, targetRole: 'other' }] : [] }), declared: null, real: [{ id: 'r', label: 'get through', effect: { [ME]: 0.5 }, weight: 1 }], roles: { other: OTHER } };
  const other: Instance = { identity: newIdentity('other'), declared: null, real: [] };
  return s.responses.map((r) => {
    const story: Story = {
      characters: { [ME]: me, [OTHER]: other },
      names: { [ME]: identity.name, [OTHER]: tr('the other person') },
      beats: [
        { id: '1', title: '1', present: [ME, OTHER], events: s.events, deeds: [] },
        { id: '2', title: '2', present: [ME, OTHER], events: [], deeds: [{ id: 'x', actor: ME, ...r.deed }] },
      ],
      settings: { ...DEFAULT_SETTINGS, seed: 7 },
    };
    return { text: r.text, chance: simulate(story).deeds[0]?.chance ?? 0 };
  });
}

export default function Sandbox({ identity }: { identity: Identity }) {
  const [id, setId] = useState(SITUATIONS[0].id);
  const situation = SITUATIONS.find((s) => s.id === id)!;
  const result = useMemo(() => chances(identity, situation), [identity, situation]);
  const total = result.reduce((s, r) => s + r.chance, 0) || 1;
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <label htmlFor="situation" className={label}>{tr('Test situation')}</label>
      <select id="situation" value={id} onChange={(e) => setId(e.target.value)} className={`${small} w-full sm:w-auto`}>
        {SITUATIONS.map((s) => <option key={s.id} value={s.id}>{tr(s.text)}</option>)}
      </select>
      <ul className="space-y-1.5" aria-live="polite">
        {result.map((r) => (
          <li key={r.text} className="text-sm">
            <div className="flex justify-between text-xs"><span className="text-foreground">{tr(r.text)}</span><span className="tabular-nums text-muted">{Math.round((r.chance / total) * 100)}%</span></div>
            <span className="mt-0.5 block h-2 rounded-full bg-gray-100"><span className="block h-full rounded-full bg-indigo-500" style={{ width: `${Math.round((r.chance / total) * 100)}%` }} /></span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{tr('How the engine weighs each response for this character, compared with each other. A test, not a story event: nothing is saved.')}</p>
    </div>
  );
}
