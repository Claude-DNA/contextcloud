import { describe, expect, it } from 'vitest';
import { distance, moralScore } from './math';
import { newIdentity, readIdentity, temperatureOf } from './identity';
import { simulate } from './simulate';
import { buildStory } from './story';
import { DEFAULT_SETTINGS, type Beat, type Deed, type Instance, type Story, type StoryEvent } from './types';

function inst(name: string, over: Partial<Instance> = {}, identity: Record<string, unknown> = {}): Instance {
  return { identity: readIdentity({ ...newIdentity(name), ...identity }), declared: null, real: [], ...over };
}
function beat(id: string, present: string[], events: StoryEvent[] = [], deeds: Deed[] = [], flash = false): Beat {
  return { id, title: id, present, events, deeds, flash };
}
function story(characters: Record<string, Instance>, beats: Beat[], settings = {}): Story {
  return { characters, names: Object.fromEntries(Object.keys(characters).map((k) => [k, k])), beats, settings: { ...DEFAULT_SETTINGS, ...settings } };
}
const wrong = (id: string, by: string, target: string, size = 0.7): StoryEvent => ({ id, label: 'humiliates', kind: 'wrong', by, target, effect: { [target]: -size }, size });

describe('distance', () => {
  it('is 0 for identical vectors and for two empty ones', () => {
    expect(distance({ a: 0.5 }, { a: 0.5 })).toBeCloseTo(0);
    expect(distance({}, {})).toBe(0);
  });
  it('sees size, not only direction: $10 promised vs $10,000 given', () => {
    expect(distance({ b: 0.01 }, { b: 1 })).toBeGreaterThan(0.25);
  });
  it('treats something against nothing as far apart', () => {
    expect(distance({ b: 0.8 }, {})).toBeGreaterThan(0.4);
  });
  it('is near 1 for opposite vectors of the same size', () => {
    expect(distance({ b: 0.8 }, { b: -0.8 })).toBeGreaterThan(0.65);
  });
});

describe('moral score', () => {
  it('counts effects on others, not on oneself', () => {
    expect(moralScore({ me: 1 }, 'me', {})).toBe(0);
    expect(moralScore({ b: -0.6 }, 'me', {})).toBeLessThan(-0.5);
    expect(moralScore({ b: -0.6 }, 'me', { b: 0 })).toBe(0);
  });
});

describe('identity', () => {
  it('clamps values and drops unknown fields from a character file', () => {
    const id = readIdentity({ name: 'Anna', conscience: 7, selfImage: -4, persistence: { overall: 2, resentment: 0.9, junk: 1 }, hacker: true });
    expect(id.conscience).toBe(1);
    expect(id.selfImage).toBe(-1);
    expect(id.persistence).toEqual({ overall: 1, resentment: 0.9 });
    expect((id as unknown as Record<string, unknown>).hacker).toBeUndefined();
  });
  it('blends a cast of references into a temperature', () => {
    const t = temperatureOf(readIdentity({ name: 'X', temperature: { cast: [{ reference: 'Jean-Luc Picard', weight: 50 }, { reference: 'Dmitri Karamazov', weight: 50 }] } }), 0.35);
    expect(t).toBeCloseTo((0.15 + 0.9) / 2);
  });
});

describe('simulate', () => {
  const cast = () => ({
    a: inst('a', { real: [{ id: 'r1', label: 'be promoted over b', effect: { a: 0.6, b: -0.4 }, weight: 1 }], declared: { id: 'd', label: 'help b', effect: { b: 0.5 }, weight: 1 } }),
    b: inst('b', { real: [{ id: 'r1', label: 'do good work', effect: { b: 0.4, world: 0.3 }, weight: 1 }] }),
  });

  it('is deterministic: the same story and seed give the same run', () => {
    const s = story(cast(), [beat('1', ['a', 'b'], [wrong('e1', 'b', 'a')]), beat('2', ['a', 'b'], [], [{ id: 'x', actor: 'a', label: 'sabotages b', effect: { b: -0.6 }, visibility: 0.4 }])]);
    expect(JSON.stringify(simulate(s))).toBe(JSON.stringify(simulate(structuredClone(s))));
  });

  it('builds resentment from a wrong and keeps it across quiet scenes', () => {
    const s = story(cast(), [beat('1', ['a', 'b'], [wrong('e1', 'b', 'a')]), beat('2', ['a']), beat('3', ['a'])]);
    const r = simulate(s);
    const res = (i: number) => r.beats[i].characters.a.ledger.find((x) => x.feeling === 'resentment' && x.target === 'b');
    expect(res(0)?.significance).toBeGreaterThan(0.2);
    expect(res(2)?.significance).toBeGreaterThan(0.15);
    expect(res(2)!.intensity).toBeLessThan(res(0)!.intensity);
  });

  it('lets an easy-going character cool and let go faster than a stubborn one', () => {
    const run = (p: number) => {
      const c = cast();
      c.a.identity.persistence = { overall: p };
      const r = simulate(story(c, [beat('1', ['a', 'b'], [wrong('e1', 'b', 'a')]), beat('2', ['a']), beat('3', ['a']), beat('4', ['a'])]));
      return r.beats[3].characters.a.ledger.find((x) => x.feeling === 'resentment')!;
    };
    const easy = run(0), stubborn = run(1);
    expect(easy.intensity).toBeLessThan(stubborn.intensity);
    expect(easy.significance).toBeLessThan(stubborn.significance);
  });

  it('discharges resentment with an apology from the same person', () => {
    const apology: StoryEvent = { id: 'e2', label: 'apologises', kind: 'apology', by: 'b', target: 'a', effect: { a: 0.3 }, size: 0.8 };
    const r = simulate(story(cast(), [beat('1', ['a', 'b'], [wrong('e1', 'b', 'a')]), beat('2', ['a', 'b'], [apology])]));
    const before = r.beats[0].characters.a.ledger.find((x) => x.feeling === 'resentment')!.significance;
    const after = r.beats[1].characters.a.ledger.find((x) => x.feeling === 'resentment')?.significance ?? 0;
    expect(after).toBeLessThan(before);
  });

  it('flags an unprovoked cruel deed by a decent, predictable character, but not by a Dostoevsky one', () => {
    const run = (temperature: number) => {
      const c = { a: inst('a', { real: [{ id: 'r1', label: 'help b', effect: { b: 0.6 }, weight: 1 }] }, { selfImage: 0.8, conscience: 0.9, temperature: { value: temperature } }), b: inst('b') };
      return simulate(story(c, [beat('1', ['a', 'b'], [], [{ id: 'x', actor: 'a', label: 'strikes b', effect: { b: -0.8 }, visibility: 1, plotWeight: 0.8 }])]));
    };
    const calm = run(0.05), wild = run(1);
    expect(calm.deeds[0].chance).toBeLessThan(0.1);
    expect(calm.flags.some((f) => f.code === 'undermotivated' || f.code === 'plot-hole')).toBe(true);
    expect(wild.deeds[0].chance).toBeGreaterThan(calm.deeds[0].chance);
  });

  it('names a likely source only when the story shows a channel', () => {
    const c = {
      a: inst('a', { real: [{ id: 'r1', label: 'live quietly', effect: { a: 0.5 }, weight: 1 }] }, { selfImage: 0.7, conscience: 0.9, temperature: { value: 0.05 } }),
      b: inst('b'),
      v: inst('v', { real: [{ id: 'r1', label: 'ruin b', effect: { b: -0.8 }, weight: 1 }] }),
    };
    const deed: Deed = { id: 'x', actor: 'a', label: 'betrays b', effect: { b: -0.7 }, visibility: 0.5, plotWeight: 0.8 };
    const without = simulate(story(c, [beat('1', ['a', 'b']), beat('2', ['a', 'b'], [], [deed])]));
    const threat: StoryEvent = { id: 't', label: 'threatens', kind: 'threat', by: 'v', target: 'a', effect: { a: -0.3 }, size: 0.6 };
    const withThreat = simulate(story(c, [beat('1', ['a', 'v'], [threat]), beat('2', ['a', 'b'], [], [deed])]));
    expect(without.flags.some((f) => f.code === 'unexplained-beneficiary')).toBe(true);
    expect(withThreat.flags.some((f) => f.code === 'driven-from-outside' && f.data?.source === 'v')).toBe(true);
  });

  it('shares responsibility once the author confirms the source', () => {
    const c = { a: inst('a', {}, { selfImage: 0.7 }), b: inst('b'), v: inst('v') };
    const r = simulate(story(c, [beat('1', ['a', 'b', 'v'], [], [{ id: 'x', actor: 'a', label: 'betrays b', effect: { b: -0.7 }, visibility: 0.5, forcedBy: 'v', pressure: 0.9 }])]));
    expect(r.beats[0].characters.v.good).toBeLessThan(0);
    expect(r.beats[0].characters.a.good).toBeGreaterThan(r.beats[0].characters.v.good);
  });

  it('exposes a schemer whose visible deeds contradict what he declares', () => {
    const c = cast();
    const sab = (id: string): Deed => ({ id, actor: 'a', label: 'undermines b', effect: { b: -0.7 }, visibility: 0.9 });
    const r = simulate(story(c, [1, 2, 3, 4, 5].map((i) => beat(String(i), ['a', 'b'], [], [sab(`x${i}`)]))));
    expect(r.flags.some((f) => f.code === 'exposure' && f.character === 'a')).toBe(true);
    expect(r.beats[4].characters.a.trust.b).toBeLessThan(0.5);
  });

  it('does not carry a flashback into the present', () => {
    const r = simulate(story(cast(), [beat('1', ['a', 'b'], [wrong('e1', 'b', 'a')], [], true), beat('2', ['a'])]));
    expect(r.beats[0].characters.a.ledger.some((x) => x.feeling === 'resentment')).toBe(true);
    expect(r.beats[1].characters.a.ledger.some((x) => x.feeling === 'resentment')).toBe(false);
  });

  it('reports branch chances at a zero-chance pivot', () => {
    const c = { a: inst('a', { real: [{ id: 'r1', label: 'save b', effect: { b: 0.9 }, weight: 1 }] }, { selfImage: 0.9 }), b: inst('b') };
    c.a.identity.history = [];
    const r = simulate(story(c, [beat('1', ['a', 'b'], [], [{ id: 'x', actor: 'a', label: 'stands alone at the gate', effect: { b: 0.9 }, visibility: 1, odds: 0, branch: 'heroic', plotWeight: 1 }])]));
    expect(r.deeds[0].branchChances).toBeDefined();
    expect(r.flags.some((f) => f.code === 'pivot')).toBe(true);
    expect(r.beats[0].characters.a.selfImage).toBeGreaterThan(0.9);
  });

  it('keeps at most the budget of shown questions per scene', () => {
    const c = { a: inst('a', {}, { selfImage: 0.9, conscience: 1, temperature: { value: 0 } }), b: inst('b'), d: inst('d'), e: inst('e') };
    const deeds: Deed[] = ['b', 'd', 'e', 'b', 'd'].map((t, i) => ({ id: `x${i}`, actor: 'a', label: `hurts ${t}`, effect: { [t]: -0.9 }, visibility: 1, plotWeight: 0.9 }));
    const r = simulate(story(c, [beat('1', ['a', 'b', 'd', 'e'], [], deeds)], { flagBudget: 2 }));
    expect(r.flags.filter((f) => f.beat === 0 && f.shown).length).toBeLessThanOrEqual(2);
    expect(r.flags.filter((f) => f.beat === 0 && !f.note).length).toBeGreaterThan(2);
  });
});

describe('calibration', () => {
  it('finds sabotage plausible after a humiliation and a lost promotion, and small kindness easy', () => {
    const a = inst('a', {
      real: [{ id: 'r1', label: 'promotion over b', effect: { a: 0.7, b: -0.4 }, weight: 0.7 }, { id: 'r2', label: 'be liked', effect: { a: 0.3, b: 0.2 }, weight: 0.3 }],
      declared: { id: 'd', label: 'help b', effect: { b: 0.5 }, weight: 1 },
    }, { selfImage: 0.5, conscience: 0.6 });
    const r = simulate(story({ a, b: inst('b') }, [
      beat('1', ['a', 'b'], [
        { id: 'e', label: 'b promoted', kind: 'happening', by: 'b', target: 'a', effect: { b: 0.6, a: -0.4 }, size: 0.7 },
        { id: 'e2', label: 'b mocks a', kind: 'wrong', by: 'b', target: 'a', effect: { a: -0.5 }, size: 0.6 },
      ]),
      beat('2', ['a', 'b'], [], [{ id: 'x', actor: 'a', label: 'sabotages report', effect: { b: -0.6, a: 0.3 }, visibility: 0.3, plotWeight: 0.7, choice: true }]),
      beat('3', ['a', 'b'], [], [{ id: 'y', actor: 'a', label: 'brings coffee', effect: { b: 0.2 }, visibility: 1 }]),
    ]));
    expect(r.deeds[0].chance).toBeGreaterThan(0.3);
    expect(r.deeds[1].chance).toBeGreaterThan(0.8);
    expect(r.beats[1].characters.a.shown).toBeGreaterThan(r.beats[1].characters.a.good);
  });
});

describe('buildStory', () => {
  it('reads approved scene data and ignores ids outside the story', () => {
    const s = buildStory([
      { id: 'a', cloud_type: 'characters', title: 'Anna', metadata: { engine: { real: [{ label: 'x', effect: { b: 0.5, stranger: 1 }, weight: 1 }] } } },
      { id: 'b', cloud_type: 'characters', title: 'Boris', metadata: {} },
      { id: 's1', cloud_type: 'arc', title: 'Scene', metadata: { engine: { approved: { present: ['a', 'b', 'zz'], deeds: [{ actor: 'a', label: 'helps', effect: [{ target: 'b', value: 0.4 }, { target: 'zz', value: 1 }] }] } } } },
    ], { seed: 7 });
    expect(s.characters.a.real[0].effect).toEqual({ b: 0.5 });
    expect(s.beats[0].present).toEqual(['a', 'b']);
    expect(s.beats[0].deeds[0].effect).toEqual({ b: 0.4 });
    expect(s.settings.seed).toBe(7);
    expect(simulate(s).beats).toHaveLength(1);
  });
});
