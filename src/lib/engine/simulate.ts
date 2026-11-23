/**
 * Character State Engine — the State engine: simulate(story) → positions, ledger and flags at every beat.
 * Pure and deterministic: no AI, no clock; every random step is seeded from the story's seed.
 * Section names in comments follow "Character State Engine: Spec v2.1".
 */
import {
  WORLD, type Beat, type Branch, type CharacterSnapshot, type Deed, type DeedReport, type Effect, type Flag, type FlagCode,
  type Instance, type RunResult, type Settings, type Story, type StoryEvent,
} from './types';
import { add, clamp, clamp1, cosine, distance, gauss, mean, moralScore, norm, roll, round, sigmoid, softmax } from './math';
import { BETA, BREAK_THRESHOLD, CARRIED, FEELING, FEELINGS, INFLOW, PASSING } from './feelings';
import { persistenceOf, temperatureOf } from './identity';

const ANY = '*';
const key = (feeling: string, target: string = ANY) => `${feeling}|${target}`;
const split = (k: string) => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1)] as const; };

/** Tunable constants, in one place for calibration. */
export const K = {
  passingKeep: 0.35, // share of a passing feeling that survives into the next beat (above baseline)
  floor: 0.1, // a written deed below this chance is undermotivated
  plotHole: 0.03,
  ambiguity: 0.08, // the margin δ between two agendas' distances
  recency: 0.75, // γ: how fast older deeds count less
  window: 6,
  exposure: 0.4, // trust below this exposes the character
  severityFloor: 0.12,
  beneficiary: 0.35,
  channelBeats: 6,
};

interface DeedMark { beat: number; effect: Effect; weight: number; visibility: number; deed: string }
interface Channel { beat: number; from: string; to: string; kind: string }

interface CState {
  id: string;
  inst: Instance;
  T: number;
  selfImage: number;
  passing: Record<string, number>;
  ledger: Record<string, { I: number; U: number }>;
  weights: number[];
  marks: DeedMark[]; // own deeds (and deeds pushed through others, weighted by ρ)
  chances: number[];
  beliefs: Record<string, Effect>; // this character's guess at each other's real agenda
  exposedBy: string[];
  history: Record<string, number[]>; // balance key → U per beat, for spirals
  idle: number;
  flat: number;
  cooldown: Record<string, number>;
  last?: { good: number; love: number; uSum: number };
}

// ── Reading the state ──

const gen = (c: CState, f: string) => c.passing[key(f)] ?? 0;
const at = (c: CState, f: string, t: string) => c.passing[key(f, t)] ?? 0;
const maxAt = (c: CState, f: string) => Math.max(0, ...Object.entries(c.passing).filter(([k]) => k.startsWith(`${f}|`) && !k.endsWith(`|${ANY}`)).map(([, v]) => v));
const bal = (c: CState, f: string, t: string) => c.ledger[key(f, t)] ?? { I: 0, U: 0 };
const maxBal = (c: CState, f: string, part: 'I' | 'U') => Math.max(0, ...Object.entries(c.ledger).filter(([k]) => k.startsWith(`${f}|`)).map(([, b]) => b[part]));
const sens = (c: CState, f: string) => 0.5 + (c.inst.identity.temperament.sensitivity[f] ?? 0.5);
const baseline = (c: CState, f: string) => c.inst.identity.temperament.baseline[f] ?? 0;

function bump(c: CState, f: string, amount: number, target: string = ANY) {
  if (!(amount > 0) || !FEELING[f]) return;
  const k = key(f, FEELING[f].targeted ? target : ANY);
  c.passing[k] = clamp((c.passing[k] ?? 0) + amount * sens(c, f) * (1 - (c.passing[k] ?? 0)) );
}

const dominant = (c: CState) => (c.weights.length ? c.weights.indexOf(Math.max(...c.weights)) : -1);
const realMix = (c: CState): Effect => mean(c.inst.real.map((a) => a.effect), c.weights);

// ── The ledger (spec: The ledger; Persistence) ──

interface Flow { P: Record<string, number>; X: Record<string, number>; reactivate: Set<string> }
const newFlow = (): Flow => ({ P: {}, X: {}, reactivate: new Set() });
const addTo = (m: Record<string, number>, k: string, v: number) => { if (v > 0) m[k] = (m[k] ?? 0) + v; };

/**
 * One ledger step. Passing feelings pointing the same way flow in; when `since` is given, only what they
 * gained since that copy flows in (the deed step runs after the event step in the same beat).
 */
function updateLedger(c: CState, flow: Flow, fade: boolean, closed: string[], since?: Record<string, number>) {
  for (const { from, to, k } of INFLOW) {
    for (const [pk, v] of Object.entries(c.passing)) {
      const [f, t] = split(pk);
      if (f === from && t !== ANY) addTo(flow.P, key(to, t), k * (since ? Math.max(0, v - (since[pk] ?? 0)) : v));
    }
  }
  const touched = new Set([...Object.keys(flow.P), ...Object.keys(flow.X), ...flow.reactivate, ...(fade ? Object.keys(c.ledger) : [])]);
  for (const bk of touched) {
    const [f, t] = split(bk);
    if (!CARRIED.includes(f)) continue;
    const s = persistenceOf(c.inst.identity, f);
    const b = c.ledger[bk] ?? { I: 0, U: 0 };
    const before = b.U;
    const P = clamp(flow.P[bk] ?? 0);
    const X = (flow.X[bk] ?? 0) * (1 - s / 2);
    let U = b.U + P * (1 + (BETA[f] ?? 0.4) * b.U) * (1 - b.U) - X;
    let I = (fade ? (0.55 + 0.43 * s) * b.I : b.I) + P * (1 - b.I) - X;
    if (flow.reactivate.has(bk)) I = Math.max(I, 0.6 * (0.5 + s) * U);
    if (fade && P < 0.05) U *= 1 - 0.08 * (1 - s); // the easy-going let go, even without discharge
    if (U < 0 && (f === 'resentment' || f === 'hate') && t !== ANY) {
      // An apology much bigger than the grievance turns into gratitude and trust.
      const surplus = -U;
      const lv = c.ledger[key('love', t)] ?? { I: 0, U: 0 };
      c.ledger[key('love', t)] = { I: clamp(lv.I + surplus * 0.5), U: clamp(lv.U + surplus * 0.4) };
      c.passing[key('distrust', t)] = clamp((c.passing[key('distrust', t)] ?? 0) - surplus);
    }
    U = clamp(U); I = clamp(I);
    if (before >= 0.4 && U < 0.1) closed.push(bk);
    if (U < 0.005 && I < 0.005) delete c.ledger[bk];
    else c.ledger[bk] = { I, U };
  }
}

// ── Appraisal (spec: State update rule → Appraisal) ──

function goalProgress(c: CState, effect: Effect): number {
  if (!c.inst.real.length || norm(effect) < 1e-6) return 0;
  return c.inst.real.reduce((s, a, i) => s + c.weights[i] * (cosine(effect, a.effect) ?? 0), 0) * Math.min(1, norm(effect));
}

function appraise(c: CState, ev: StoryEvent, flow: Flow, seed: number, beat: number, channels: Channel[]) {
  const scatter = Math.max(0, 1 + 0.5 * c.T * gauss(seed, 'appraise', beat, ev.id, c.id));
  const s = clamp(ev.size) * scatter;
  const by = ev.by && ev.by !== c.id ? ev.by : undefined;
  const direct = ev.effect[c.id] ?? 0;
  const net = clamp1(direct + 0.7 * goalProgress(c, ev.effect));
  const grudge = by ? 1 + (BETA.resentment ?? 0.8) * bal(c, 'resentment', by).U : 1; // old wounds bend the reading
  const target = ev.target && ev.target !== c.id ? ev.target : undefined;

  switch (ev.kind) {
    case 'wrong':
      if (by) {
        bump(c, 'rage', s * grudge, by);
        addTo(flow.P, key('resentment', by), 0.35 * s * grudge);
        flow.reactivate.add(key('resentment', by));
      }
      break;
    case 'kindness':
      bump(c, 'joy', s);
      if (by) { bump(c, 'joy', s, by); addTo(flow.P, key('love', by), 0.15 * s); addTo(flow.X, key('resentment', by), 0.1 * s); }
      break;
    case 'loss': {
      const lost = target ?? ANY;
      addTo(flow.P, key('grief', lost), s * (1 + bal(c, 'love', lost).U));
      if (target) addTo(flow.P, key('longing', target), 0.3 * s);
      bump(c, 'despair', 0.3 * s);
      break;
    }
    case 'apology':
      if (by) { addTo(flow.X, key('resentment', by), s); addTo(flow.X, key('hate', by), 0.5 * s); }
      break;
    case 'betrayal':
      if (by) {
        addTo(flow.X, key('love', by), s);
        addTo(flow.P, key('resentment', by), s);
        bump(c, 'distrust', s, by);
        bump(c, 'rage', 0.6 * s, by);
        c.beliefs[by] = add(c.beliefs[by] ?? {}, { [c.id]: -s }, 0.8);
      }
      break;
    case 'reminder': {
      const t = target ?? by;
      if (t) for (const f of CARRIED) flow.reactivate.add(key(f, t));
      else {
        const biggest = Object.entries(c.ledger).sort((a, b) => b[1].U - a[1].U)[0];
        if (biggest) flow.reactivate.add(biggest[0]);
      }
      break;
    }
    case 'threat':
      bump(c, 'fear', s);
      if (by) { bump(c, 'distrust', 0.5 * s, by); channels.push({ beat, from: by, to: c.id, kind: 'threat' }); }
      break;
    case 'lie':
    case 'contact':
      if (by) channels.push({ beat, from: by, to: c.id, kind: ev.kind });
      break;
    default:
      break;
  }

  // Any event also moves goals: progress lifts, a block hurts. Rage when someone can be blamed and they feel able to act.
  if (ev.kind === 'happening' || ev.kind === 'kindness' || ev.kind === 'wrong' || ev.kind === 'loss') {
    if (net > 0.02) { bump(c, 'joy', net * s); bump(c, 'hope', 0.5 * net * s); }
    else if (net < -0.02) {
      const control = (by ? 0.6 : 0.3) + 0.2 * gen(c, 'pride') - 0.3 * gen(c, 'despair');
      if (by && control >= 0.5) bump(c, 'rage', -net * s * grudge, by);
      else bump(c, 'fear', -net * s);
      if (gen(c, 'hope') < 0.2) bump(c, 'despair', -0.3 * net * s);
    }
  }
  // Someone hurt a person I love: fear for them feeds love, and anger at the one who did it.
  if (target && by && (ev.effect[target] ?? 0) < -0.1) {
    const love = bal(c, 'love', target).U;
    if (love > 0.2) { addTo(flow.P, key('love', target), 0.3 * s * love); bump(c, 'rage', 0.5 * s * love, by); }
  }
}

// ── Motivation (spec: Motivation; Temperature and seeds; Zero-chance fork) ──

interface Motive extends Omit<DeedReport, 'beat' | 'deed' | 'actor' | 'label'> { servedIndex: number; ambiguousIdx?: number[]; distances: number[]; gA: number }

function motive(c: CState, d: Deed, settings: Settings): Motive {
  const A = d.effect;
  const lambda = settings.lambda;
  const distances = c.inst.real.map((a) => distance(A, a.effect, lambda));
  const order = distances.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const servedIndex = order.length ? order[0][1] : -1;
  const ambiguousIdx = order.length > 1 && order[1][0] - order[0][0] < K.ambiguity ? [order[0][1], order[1][1]] : undefined;
  const wAgenda = ambiguousIdx
    ? ambiguousIdx.reduce((s, i) => s + c.weights[i] * (1 - distances[i]), 0)
    : servedIndex >= 0 ? c.weights[servedIndex] * (1 - distances[servedIndex]) : 0;
  let wFeel = 0, grudge = 0;
  for (const [t, v] of Object.entries(A)) {
    if (t === c.id || t === WORLD) continue;
    if (v < -0.1) {
      const g = bal(c, 'resentment', t).U + bal(c, 'hate', t).U;
      wFeel = Math.max(wFeel, 0.6 * g);
      grudge = Math.max(grudge, clamp(g));
    }
    if (v > 0.1) wFeel = Math.max(wFeel, 0.6 * (bal(c, 'love', t).U + bal(c, 'guilt', t).U));
  }
  const want = clamp(wAgenda + wFeel);
  const urgency = Math.max(gen(c, 'fear'), maxAt(c, 'rage'), maxBal(c, 'resentment', 'I'));
  const size = Math.max(0, ...Object.values(A).map(Math.abs));
  const stakes = clamp(size * (0.8 + 0.8 * urgency));
  const odds = clamp((d.odds ?? 0.6) + 0.3 * gen(c, 'hope') - 0.4 * gen(c, 'despair'));
  const gA = moralScore(A, c.id, settings.moralWeights);
  const outward = clamp(0.7 * maxBal(c, 'love', 'I') + 0.5 * gen(c, 'curiosity'));
  const alignment = 1 - Math.abs(c.selfImage - gA) / 2;
  const meaning = clamp(alignment * (0.25 + 0.5 * outward) * (1 - 0.6 * clamp(gen(c, 'shame') + gen(c, 'confusion'))) * (gA >= 0 ? 1 : 0.5));
  const inner = 1.5 * want * stakes * odds + meaning;
  const outside = d.forcedBy ? clamp(d.pressure ?? 0.5) : 0;
  // Moral cost: only harm costs, more for those who think well of themselves. Confusion and Pride lower
  // conscience, and a grudge against the victim rationalizes the deed (the Evil Formula as a mechanism).
  const conscience = c.inst.identity.conscience * clamp(1 - 0.5 * gen(c, 'confusion') - 0.4 * gen(c, 'pride'));
  const moralCost = gA < 0 ? Math.max(0, c.selfImage - gA) * conscience * 0.5 * (1 - 0.7 * grudge) : 0;
  const D = c.inst.declared?.effect;
  const dom = dominant(c);
  const hidden = D && dom >= 0 ? distance(D, c.inst.real[dom].effect, lambda) : 0;
  const exposure = D ? 0.4 * clamp(d.visibility) * distance(A, D, lambda) * (0.5 + hidden) : 0;
  const cost = Math.max(0.05, (d.risk ?? 0.25 * size) + (d.effort ?? 0.02 + 0.1 * size) + moralCost + exposure);
  const motivation = inner + outside;
  const ratio = motivation / cost;
  let chance = sigmoid((ratio - 1) / (0.05 + 0.55 * c.T));

  let branchChances: Record<Branch, number> | undefined;
  const pressure = want * stakes;
  if (odds < 0.12 && pressure > 0.35) {
    const scores = [
      2 * meaning + outward,
      clamp(gen(c, 'shame') + gen(c, 'confusion') + gen(c, 'despair')) + (1 - c.selfImage) / 3,
      maxAt(c, 'rage') + 0.5 * maxBal(c, 'resentment', 'I'),
    ];
    const p = softmax(scores.map((x) => x * (1 + pressure)), 0.05 + 0.5 * c.T);
    branchChances = { heroic: p[0], despair: p[1], rage: p[2] };
    if (d.branch) chance = branchChances[d.branch];
  }
  return {
    motivation, inner, outside, cost, ratio, chance, served: c.inst.real[servedIndex]?.id, servedIndex,
    ambiguous: ambiguousIdx?.map((i) => c.inst.real[i].id), ambiguousIdx, distances, gA,
    meaning, want, stakes, odds, moralCost, branchChances,
  };
}

// ── Positions (spec: Position; Agendas, deeds and honesty) ──

function position(c: CState, settings: Settings, shown: boolean): number {
  const marks = c.marks.slice(-K.window);
  let num = 0, den = 0;
  // Responsibility scales a deed's weight; recency and visibility only decide how much it counts in the average.
  marks.forEach((m, i) => {
    const w = K.recency ** (marks.length - 1 - i) * (shown ? m.visibility : 1);
    num += w * m.weight * moralScore(m.effect, c.id, settings.moralWeights);
    den += w;
  });
  const agenda = shown ? c.inst.declared?.effect ?? {} : realMix(c);
  const gR = moralScore(agenda, c.id, settings.moralWeights);
  if (den < 1e-6) return Math.tanh(1.3 * gR);
  return Math.tanh(1.3 * (settings.alpha * (num / den) + (1 - settings.alpha) * gR));
}

function loveFear(c: CState): number {
  let s = 0;
  const strongest: Record<string, number> = {};
  for (const [k, v] of Object.entries(c.passing)) { const [f] = split(k); strongest[f] = Math.max(strongest[f] ?? 0, v); }
  for (const [f, v] of Object.entries(strongest)) s += (FEELING[f]?.side ?? 0) * v;
  for (const [k, b] of Object.entries(c.ledger)) { const [f] = split(k); s += (FEELING[f]?.side ?? 0) * b.I * 0.7; }
  return Math.tanh(0.9 * s);
}

function honesty(c: CState, lambda: number) {
  const recent = c.marks.filter((m) => m.weight >= 0.5).slice(-3).map((m) => m.effect);
  const A = recent.length ? mean(recent) : null;
  const D = c.inst.declared?.effect ?? null;
  const dom = dominant(c);
  const R = dom >= 0 ? c.inst.real[dom].effect : null;
  const deception = D && R ? distance(D, R, lambda) : 0;
  const hypocrisy = A && D ? distance(A, D, lambda) : 0;
  const selfBetrayal = A && R ? distance(A, R, lambda) : 0;
  const parts = [D && R ? deception : null, A && D ? hypocrisy : null, A && R ? selfBetrayal : null].filter((x): x is number => x !== null);
  return { deception, hypocrisy, selfBetrayal, honesty: parts.length ? 1 - parts.reduce((a, b) => a + b, 0) / parts.length : 1 };
}

// ── The run ──

/** Writer-facing text: English templates with {placeholders}; the server passes its translator. */
export type Say = (text: string, vars?: Record<string, unknown>) => string;
const fill: Say = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

export function simulate(story: Story, say: Say = fill): RunResult {
  const settings = story.settings;
  const feel = (f: string) => say(FEELING[f]?.label ?? f).toLowerCase();
  const balanceName = (id: string, f: string, t: string) => (t !== ANY && t !== id
    ? say('{name}\'s {feeling} toward {other}', { name: name(id), feeling: feel(f), other: name(t) })
    : say('{name}\'s {feeling}', { name: name(id), feeling: feel(f) }));
  const branchName = (x: Branch) => say(x === 'heroic' ? 'heroic' : x === 'despair' ? 'despair' : 'rage');
  const seed = settings.seed;
  const ids = Object.keys(story.characters);
  const name = (id: string) => story.names[id] ?? (id === WORLD ? 'the world' : id);
  const states: Record<string, CState> = {};

  for (const id of ids) {
    const inst = story.characters[id];
    const c: CState = {
      id, inst,
      T: temperatureOf(inst.identity, settings.storyTemperature),
      selfImage: inst.identity.selfImage,
      passing: {}, ledger: {},
      weights: inst.real.map((a) => a.weight),
      marks: [], chances: [], beliefs: {}, exposedBy: [], history: {}, idle: 0, flat: 0, cooldown: {},
    };
    const tw = c.weights.reduce((a, b) => a + b, 0);
    c.weights = c.weights.map((w) => (tw > 0 ? w / tw : 1 / c.weights.length));
    for (const f of PASSING) if (baseline(c, f) > 0) c.passing[key(f)] = baseline(c, f);
    for (const w of inst.identity.history) {
      const t = (w.targetRole && inst.roles?.[w.targetRole]) || ANY;
      c.ledger[key(w.feeling, t)] = { U: clamp(w.significance), I: clamp(0.3 * w.significance) };
    }
    states[id] = c;
  }

  const flags: Flag[] = [];
  const deedReports: DeedReport[] = [];
  const channels: Channel[] = [];
  const exposures: Exposure[] = [];
  const out: RunResult['beats'] = [];
  const flag = (f: Omit<Flag, 'severity'> & { severity?: number }) => flags.push({ severity: 0.3, ...f });
  const cool = (c: CState, code: string, beat: number, gap = 3) => {
    if ((c.cooldown[code] ?? -99) > beat - gap) return false;
    c.cooldown[code] = beat;
    return true;
  };

  story.beats.forEach((beat, b) => {
    const saved = beat.flash ? structuredClone(states) : null;
    const present = new Set(beat.present.filter((p) => states[p]));
    for (const e of beat.events) { if (e.by && states[e.by]) present.add(e.by); if (e.target && states[e.target]) present.add(e.target); }
    for (const d of beat.deeds) if (states[d.actor]) present.add(d.actor);
    const flows: Record<string, Flow> = Object.fromEntries(ids.map((id) => [id, newFlow()]));
    const closed: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]));
    const uBefore: Record<string, Record<string, number>> = Object.fromEntries(ids.map((id) => [id, Object.fromEntries(Object.entries(states[id].ledger).map(([k, v]) => [k, v.U]))]));

    // 1. Passing feelings settle back toward each character's resting level.
    for (const c of Object.values(states)) {
      for (const [k, v] of Object.entries(c.passing)) {
        const [f, t] = split(k);
        const base = t === ANY ? baseline(c, f) : 0;
        const next = base + (v - base) * K.passingKeep;
        if (next < 0.01 && base === 0) delete c.passing[k]; else c.passing[k] = next;
      }
    }

    // 2. Appraise the beat's events.
    for (const ev of beat.events) {
      const who = ev.witnesses?.length ? ev.witnesses : [...present];
      for (const id of who) if (states[id] && id !== ev.by) appraise(states[id], ev, flows[id], seed, b, channels);
    }

    // 3. The ledger: inflow, reactivation, discharge, fade.
    for (const id of ids) updateLedger(states[id], flows[id], true, closed[id]);
    const afterEvents: Record<string, Record<string, number>> = Object.fromEntries(ids.map((id) => [id, { ...states[id].passing }]));
    const deedFlows: Record<string, Flow> = Object.fromEntries(ids.map((id) => [id, newFlow()]));

    // 4–6. Deeds: motivation, then their effects on everyone.
    const beatChances: Record<string, number[]> = {};
    for (const d of beat.deeds) {
      const c = states[d.actor];
      if (!c) continue;
      const m = motive(c, d, settings);
      const report: DeedReport = { beat: b, deed: d.id, actor: d.actor, label: d.label, ...stripMotive(m) };
      deedReports.push(report);
      c.chances.push(m.chance);
      (beatChances[c.id] ??= []).push(m.chance);
      const weight = clamp(d.plotWeight ?? 0.5);
      const who = say('{name}: “{deed}”', { name: name(c.id), deed: d.label });

      // Diagnostics on the deed itself.
      if (m.branchChances && d.branch) {
        const p = m.branchChances[d.branch];
        const likely = (Object.entries(m.branchChances) as [Branch, number][]).sort((a, z) => z[1] - a[1])[0];
        flag({ code: 'pivot', beat: b, character: c.id, deed: d.id, severity: (1 - p) * Math.max(weight, 0.5),
          message: say('{who} is a pivot: {name} sees no way to win. As written it goes the {branch} way ({p}); the state points to {likely} ({pl}).', { who, name: name(c.id), branch: branchName(d.branch), p: pct(p), likely: branchName(likely[0]), pl: pct(likely[1]) }),
          suggestion: p < 0.3 ? say(branchFix(d.branch)) : undefined, data: { branchChances: m.branchChances } });
      } else if (m.chance < K.floor && !d.forcedBy) {
        const others = ids.filter((j) => j !== c.id && states[j].inst.real.length);
        const beneficiaries = others
          .map((j) => ({ j, fit: cosine(d.effect, realMix(states[j])) ?? 0 }))
          .filter((x) => x.fit > K.beneficiary)
          .sort((a, z) => z.fit - a.fit);
        const withChannel = beneficiaries.find((x) => channels.some((ch) => ch.from === x.j && ch.to === c.id && ch.beat >= b - K.channelBeats && ch.beat <= b));
        const severity = (1 - m.chance) * weight;
        if (withChannel) {
          flag({ code: 'driven-from-outside', beat: b, character: c.id, deed: d.id, severity,
            message: say('{who} has a {p} chance for {name} alone. It serves {other}, who had a way to push ({how}). Was {name} pushed?', { who, p: pct(m.chance), name: name(c.id), other: name(withChannel.j), how: [...new Set(channels.filter((ch) => ch.from === withChannel.j && ch.to === c.id).map((ch) => say(ch.kind)))].join(', ') }),
            suggestion: say('If so, confirm {other} as the source on the deed; responsibility will be shared.', { other: name(withChannel.j) }), data: { source: withChannel.j } });
        } else if (beneficiaries.length) {
          flag({ code: 'unexplained-beneficiary', beat: b, character: c.id, deed: d.id, severity,
            message: say('{who} has a {p} chance for {name}. It mostly helps {other}, but the story shows no contact, threat or lie between them. Coincidence, or a missing scene?', { who, p: pct(m.chance), name: name(c.id), other: name(beneficiaries[0].j) }),
            suggestion: say('Show how {other} reached {name}, or give {name} a reason of their own.', { other: name(beneficiaries[0].j), name: name(c.id) }), data: { beneficiaries: beneficiaries.map((x) => x.j) } });
        } else {
          flag({ code: m.chance < K.plotHole ? 'plot-hole' : 'undermotivated', beat: b, character: c.id, deed: d.id, severity,
            message: say('{who} has a {p} chance for {name} as written so far.', { who, p: pct(m.chance), name: name(c.id) }),
            suggestion: underFix(m, say) });
        }
      }
      if (m.ambiguousIdx) {
        const [i1, i2] = m.ambiguousIdx;
        flag({ code: 'ambiguous-deed', beat: b, character: c.id, deed: d.id, note: true, severity: 0.2,
          message: say('Was {who} about “{a}” or about “{b}”?', { who, a: c.inst.real[i1].label, b: c.inst.real[i2].label }), data: { agendas: [c.inst.real[i1].id, c.inst.real[i2].id] } });
      }

      // Agenda weights move only at real choice points.
      if (d.choice && c.weights.length > 1) {
        const dom = dominant(c);
        const eta = 0.15 * (0.5 + c.T);
        const idx = m.ambiguousIdx ?? [m.servedIndex];
        const closeness = idx.map((i) => 1 - m.distances[i]);
        const total = closeness.reduce((a, z) => a + z, 0) || 1;
        idx.forEach((i, n) => { c.weights[i] += eta * (closeness[n] / total) * (1 - c.weights[i]); });
        const tw = c.weights.reduce((a, z) => a + z, 0);
        c.weights = c.weights.map((w) => w / tw);
        if (!m.ambiguousIdx && m.servedIndex !== dom && dom >= 0) {
          flag({ code: 'avoidance', beat: b, character: c.id, deed: d.id, note: true, severity: 0.1,
            message: say('{name} had a chance at “{a}” and chose “{b}” instead.', { name: name(c.id), a: c.inst.real[dom].label, b: c.inst.real[m.servedIndex].label }) });
        }
      }

      // Pivot after-effects.
      if (d.branch === 'heroic') { c.selfImage = clamp1(c.selfImage + 0.15); c.T = clamp(c.T - 0.03); }
      if (d.branch === 'despair') { c.selfImage = clamp1(c.selfImage - 0.15); c.T = clamp(c.T + 0.03); }

      // Responsibility (spec: Outside influence → Responsibility).
      const rho = d.forcedBy && states[d.forcedBy] ? m.outside / Math.max(1e-6, m.motivation) : 0;
      c.marks.push({ beat: b, effect: d.effect, weight: 1 - rho, visibility: clamp(d.visibility), deed: d.id });
      if (rho > 0) states[d.forcedBy!].marks.push({ beat: b, effect: d.effect, weight: rho, visibility: 0, deed: d.id });

      // The actor's own feelings about what they did.
      const flowA = deedFlows[c.id];
      if (m.gA < -0.1) {
        bump(c, 'shame', c.inst.identity.conscience * -m.gA * 0.6);
        for (const [t, v] of Object.entries(d.effect)) if (v < -0.1 && states[t]) addTo(flowA.P, key('guilt', t), 0.5 * c.inst.identity.conscience * -v);
        // Displacement: harming someone who is not the source of the anger drains little of it.
        const top = Object.entries(c.ledger).filter(([k, v2]) => k.startsWith('resentment|') && v2.U > 0.3).sort((a, z) => z[1].U - a[1].U)[0];
        if (top) {
          const [, src] = split(top[0]);
          for (const [t, v] of Object.entries(d.effect)) {
            if (v < -0.2 && t !== src && states[t] && bal(c, 'resentment', t).U < 0.1) {
              addTo(flowA.X, top[0], 0.15 * -v);
              addTo(flowA.P, key('guilt', t), 0.3 * -v * c.inst.identity.conscience);
            }
          }
        }
      } else if (m.gA > 0.2) {
        bump(c, 'joy', 0.1 * m.gA);
      }
      if (d.kind === 'apology' || d.kind === 'amends' || d.kind === 'confession') {
        for (const t of Object.keys(d.effect)) if (states[t]) addTo(flowA.X, key('guilt', t), d.kind === 'confession' ? 0.3 : 0.6);
      }

      // Everyone it touches appraises it.
      for (const [t, v] of Object.entries(d.effect)) {
        const tc = states[t];
        if (!tc || t === c.id || Math.abs(v) < 0.05) continue;
        if (!present.has(t) && d.visibility < 0.5) continue;
        const kind = d.kind === 'apology' || d.kind === 'amends' ? 'apology' : v < 0 ? 'wrong' : 'kindness';
        appraise(tc, { id: d.id, label: d.label, kind, by: c.id, target: t, effect: d.effect, size: Math.abs(v) }, deedFlows[t], seed, b, channels);
      }
      // Contact is a channel for later influence.
      for (const t of Object.keys(d.effect)) if (states[t] && t !== c.id) channels.push({ beat: b, from: c.id, to: t, kind: 'contact' });

      // Observers update what they believe the actor wants (spec: Beliefs, trust, exposure).
      const observers = (d.witnesses?.length ? d.witnesses : [...present]).filter((j) => j !== c.id && states[j]);
      for (const j of observers) observe(states[j], c, d.effect, d.effect[j] !== undefined ? Math.max(d.visibility, 0.8) : d.visibility, b, deedFlows[j], exposures);
    }

    // Deed-driven inflow and discharge land in the same beat (no extra fade).
    for (const id of ids) updateLedger(states[id], deedFlows[id], false, closed[id], afterEvents[id]);

    // Leaks: a suppressed grudge toward someone the character claims to support can show.
    const leakFlows: Record<string, Flow> = Object.fromEntries(ids.map((id) => [id, newFlow()]));
    for (const id of present) {
      const c = states[id];
      const D = c.inst.declared?.effect;
      if (!D) continue;
      for (const [bk, v] of Object.entries(c.ledger)) {
        const [f, t] = split(bk);
        if ((f !== 'resentment' && f !== 'hate') || !states[t] || (D[t] ?? 0) <= 0 || v.I < 0.25) continue;
        const p = v.I * (1 - c.inst.identity.selfControl) * (0.5 + c.T) * 0.6;
        if (roll(seed, 'leak', b, id, t) >= p) continue;
        const leak: Effect = { [t]: -0.3 * v.I };
        for (const j of present) if (j !== id) observe(states[j], c, leak, 0.6, b, leakFlows[j], exposures);
        flag({ code: 'leak', beat: b, character: id, note: true, severity: 0.15,
          message: say('{name}\'s hidden {feeling} toward {other} shows for a moment.', { name: name(id), feeling: feel(f), other: name(t) }) });
      }
    }

    for (const id of ids) updateLedger(states[id], leakFlows[id], false, closed[id], states[id].passing);

    // Temperature drift: trauma raises it, closed accounts lower it.
    for (const id of ids) {
      const c = states[id];
      const jump = Math.max(0, ...Object.entries(c.ledger).map(([k, v]) => v.U - (uBefore[id][k] ?? 0)));
      if (jump > 0.3) c.T = clamp(c.T + 0.05);
      if (closed[id].length) c.T = clamp(c.T - 0.03 * closed[id].length);
    }

    // Snapshots.
    const snap: Record<string, CharacterSnapshot> = {};
    for (const id of ids) {
      const c = states[id];
      const h = honesty(c, settings.lambda);
      const good = position(c, settings, false);
      const trust: Record<string, number> = {};
      const D = c.inst.declared?.effect ?? {};
      for (const j of ids) if (states[j].beliefs[id]) trust[j] = round(1 - distance(D, states[j].beliefs[id], settings.lambda));
      const ws = [...c.weights].sort((a, z) => z - a);
      snap[id] = {
        good: round(good), shown: round(position(c, settings, true)), selfImage: round(c.selfImage), love: round(loveFear(c)),
        honesty: round(h.honesty), deception: round(h.deception), hypocrisy: round(h.hypocrisy), selfBetrayal: round(h.selfBetrayal),
        conflict: round(ws.length > 1 ? 1 - (ws[0] - ws[1]) : 0), temperature: round(c.T),
        agendaWeights: Object.fromEntries(c.inst.real.map((a, i) => [a.id, round(c.weights[i])])),
        feelings: topFeelings(c),
        ledger: Object.entries(c.ledger).map(([k, v]) => { const [f, t] = split(k); return { feeling: f, target: t, intensity: round(v.I), significance: round(v.U) }; })
          .sort((a, z) => z.significance - a.significance),
        trust, present: present.has(id),
      };
    }
    out.push({ id: beat.id, title: beat.title, characters: snap });

    // Diagnostics over time.
    for (const id of ids) {
      const c = states[id];
      const s = snap[id];
      for (const [k, v] of Object.entries(c.ledger)) (c.history[k] ??= []).push(v.U);
      // Spirals: a balance rising beat after beat.
      for (const [k, hist] of Object.entries(c.history)) {
        const n = hist.length;
        if (n < 4) continue;
        const [a0, a1, a2, a3] = hist.slice(-4);
        const U = a3;
        if (a1 > a0 && a2 > a1 && a3 > a2 && U >= 0.4 && U < BREAK_THRESHOLD && cool(c, `spiral:${k}`, b, 4)) {
          const slope = (a3 - a0) / 3;
          const ahead = Math.ceil((BREAK_THRESHOLD - U) / Math.max(slope, 1e-3));
          const [f, t] = split(k);
          const when = b + ahead < story.beats.length ? say('around “{scene}”', { scene: story.beats[b + ahead].title }) : say('after the last scene');
          flag({ code: 'spiral', beat: b, character: id, severity: 0.25 + 0.4 * U,
            message: say('{what} has grown for three scenes in a row (now {u}). At this pace it breaks {when}.', { what: balanceName(id, f, t), u: pct(U), when }),
            suggestion: say('Let it break, or put a counterweight in its way: an apology, amends, or a scene that faces it.') });
        }
      }
      // A dormant wound the next scene touches.
      const next = story.beats[b + 1];
      if (next) {
        for (const [k, v] of Object.entries(c.ledger)) {
          const [f, t] = split(k);
          if (v.U < 0.5 || v.I > 0.2 || t === ANY || !touches(next, t)) continue;
          if (!cool(c, `dormant:${k}`, b, 5)) continue;
          flag({ code: 'dormant-wound', beat: b + 1, character: id, severity: 0.35,
            message: say('{name} carries an old {feeling} toward {other} (unresolved {u}, quiet now). “{scene}” touches it.', { name: name(id), feeling: feel(f), other: name(t), u: pct(v.U), scene: next.title }),
            suggestion: say('Use the flare-up, or defuse it first.') });
        }
      }
      // Overmotivated and idle.
      const dom = dominant(c);
      if (present.has(id) && dom >= 0) {
        const drive = c.weights[dom] * (0.5 + 0.5 * maxBal(c, 'resentment', 'U')) * clamp(0.6 + 0.3 * gen(c, 'hope') - 0.4 * gen(c, 'despair'));
        const acted = deedReports.some((r) => r.beat === b && r.actor === id && r.served === c.inst.real[dom].id);
        c.idle = drive / 0.25 > 2 && !acted ? c.idle + 1 : 0;
        if (c.idle >= 3) {
          c.idle = 0;
          flag({ code: 'overmotivated-idle', beat: b, character: id, severity: 0.4,
            message: say('{name} wants “{goal}” badly and has done nothing toward it for three scenes. Why not act?', { name: name(id), goal: c.inst.real[dom].label }),
            suggestion: say('Add an obstacle or a counter-fear, or give them a move.') });
        }
      }
      // Flat and unearned change.
      const uSum = Object.values(c.ledger).reduce((a, v) => a + v.U, 0);
      if (c.last) {
        const move = Math.abs(s.good - c.last.good) + Math.abs(s.love - c.last.love) + Math.abs(uSum - c.last.uSum);
        c.flat = present.has(id) && move < 0.06 ? c.flat + 1 : present.has(id) ? 0 : c.flat;
        if (c.flat >= 4) { c.flat = 0; flag({ code: 'flat', beat: b, character: id, severity: 0.3, message: say('{name} has barely moved for four scenes.', { name: name(id) }), suggestion: say('Give them an event that touches what they really want.') }); }
        const ch = beatChances[id] ?? [];
        if (Math.abs(s.good - c.last.good) > 0.4 && ch.length && Math.min(...ch) < 0.3 && cool(c, 'unearned', b)) {
          flag({ code: 'unearned-change', beat: b, character: id, severity: 0.5,
            message: say('{name} turns sharply in “{scene}” (Good–Evil {from} → {to}) on a deed the story so far makes unlikely.', { name: name(id), scene: beat.title, from: signed(c.last.good), to: signed(s.good) }),
            suggestion: say('Add the scene that prepares the turn.') });
        }
      }
      c.last = { good: s.good, love: s.love, uSum };
      // Out of type.
      const recent = c.chances.slice(-6);
      if (recent.length >= 6 && cool(c, 'type', b, 6)) {
        if (c.T < 0.3 && recent.filter((p) => p < 0.3).length >= 3) {
          flag({ code: 'out-of-type', beat: b, character: id, severity: 0.4, message: say('{name} is cast as predictable but has acted against expectation in three of the last six deeds.', { name: name(id) }), suggestion: say('Add the event that changed them, or raise their temperature.') });
        } else if (c.T > 0.7 && recent.every((p) => p > 0.9)) {
          flag({ code: 'out-of-type', beat: b, character: id, severity: 0.3, message: say('{name} is cast as unpredictable but has done exactly the expected thing six times in a row.', { name: name(id) }), suggestion: say('Let them surprise, or lower their temperature.') });
        }
      }
    }

    if (saved) { for (const id of ids) states[id] = saved[id]; } // a flashback is drawn, not carried on
  });

  // Open accounts at the end.
  const last = story.beats.length - 1;
  if (last >= 0) {
    for (const id of ids) {
      for (const [k, v] of Object.entries(states[id].ledger)) {
        const [f, t] = split(k);
        if (v.U < 0.4) continue;
        flag({ code: 'open-account', beat: last, character: id, severity: 0.2 + 0.3 * v.U,
          message: say('{what} is still open at the end ({u}).', { what: balanceName(id, f, t), u: pct(v.U) }),
          suggestion: say('Resolve it, or keep it on purpose as a sequel hook.') });
      }
    }
  }

  for (const e of exposures) {
    flag({ code: 'exposure', beat: e.beat, character: e.actor, severity: 0.6,
      message: say('{observer} now sees through {name} (trust {t}). This is a reveal.', { observer: name(e.observer), name: name(e.actor), t: pct(e.trust) }),
      suggestion: say('Write the reveal here, or keep the deeds less visible to delay it.') });
  }
  budget(flags, settings);
  return { seed, beats: out, deeds: deedReports, flags };
}

interface Exposure { beat: number; observer: string; actor: string; trust: number }

function observe(j: CState, actor: CState, effect: Effect, visibility: number, beat: number, flow: Flow, exposures: Exposure[]) {
  const D = actor.inst.declared?.effect ?? {};
  const before = j.beliefs[actor.id] ?? { ...D };
  const lambda = 0.25 * (1 + at(j, 'distrust', actor.id)) * (1 - 0.5 * bal(j, 'love', actor.id).U);
  const own: Effect = {};
  for (const [t, v] of Object.entries(effect)) if (t !== actor.id) own[t] = v;
  const R = add(before, add(own, before, -1), lambda * clamp(visibility));
  j.beliefs[actor.id] = R;
  if (!Object.keys(D).length || j.id === actor.id || actor.exposedBy.includes(j.id)) return;
  const trust = 1 - distance(D, R);
  if (trust < K.exposure) {
    actor.exposedBy.push(j.id);
    addTo(flow.P, key('resentment', actor.id), 0.4);
    bump(j, 'distrust', 0.5, actor.id);
    exposures.push({ beat, observer: j.id, actor: actor.id, trust });
  }
}

function touches(beat: Beat, t: string): boolean {
  return beat.present.includes(t) || beat.events.some((e) => e.by === t || e.target === t || t in e.effect) || beat.deeds.some((d) => d.actor === t || t in d.effect);
}

function topFeelings(c: CState): CharacterSnapshot['feelings'] {
  const list: CharacterSnapshot['feelings'] = [];
  for (const [k, v] of Object.entries(c.passing)) { const [f, t] = split(k); if (v >= 0.05) list.push({ id: f, value: round(v), ...(t !== ANY ? { target: t } : {}) }); }
  for (const [k, b] of Object.entries(c.ledger)) { const [f, t] = split(k); if (b.I >= 0.05) list.push({ id: f, value: round(b.I), ...(t !== ANY ? { target: t } : {}) }); }
  return list.sort((a, z) => z.value - a.value).slice(0, 8);
}

function stripMotive(m: Motive): Omit<DeedReport, 'beat' | 'deed' | 'actor' | 'label'> {
  return {
    motivation: round(m.motivation), inner: round(m.inner), outside: round(m.outside), cost: round(m.cost), ratio: round(m.ratio),
    chance: round(m.chance), served: m.served, ambiguous: m.ambiguous, meaning: round(m.meaning), want: round(m.want),
    stakes: round(m.stakes), odds: round(m.odds), moralCost: round(m.moralCost),
    ...(m.branchChances ? { branchChances: { heroic: round(m.branchChances.heroic), despair: round(m.branchChances.despair), rage: round(m.branchChances.rage) } } : {}),
  };
}

function underFix(m: Motive, say: Say): string {
  const weakest = say([
    [m.want, 'Give them a stronger reason to want this: an earlier provocation or an open grudge.'],
    [m.stakes, 'Raise the stakes: make more depend on it.'],
    [m.odds, 'Give them some hope it can work.'],
  ].sort((a, z) => (a[0] as number) - (z[0] as number))[0][1] as string);
  return m.moralCost > 0.3 ? `${weakest} ${say('Or lower the moral cost: a scene where they talk themselves into it.')}` : weakest;
}

function branchFix(branch: Branch): string {
  return branch === 'heroic' ? 'Build the self-image or the outward love before this scene.'
    : branch === 'despair' ? 'Show the shame or confusion that breaks them before this scene.'
    : 'Give the rage a target and a history before this scene.';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => (x >= 0 ? `+${x.toFixed(2)}` : x.toFixed(2));

/** Severity floor and the per-scene budget (spec: Diagnostics → Severity and the flag budget). */
function budget(flags: Flag[], settings: Settings) {
  const byBeat = new Map<number, Flag[]>();
  for (const f of flags) (byBeat.get(f.beat) ?? byBeat.set(f.beat, []).get(f.beat)!).push(f);
  for (const list of byBeat.values()) {
    list.filter((f) => !f.note).sort((a, z) => z.severity - a.severity)
      .forEach((f, i) => { f.shown = i < settings.flagBudget && f.severity >= K.severityFloor; });
    for (const f of list) { if (f.note) f.shown = false; f.severity = round(f.severity); }
  }
  flags.sort((a, z) => a.beat - z.beat || z.severity - a.severity);
}

export const FLAG_CODES: FlagCode[] = ['undermotivated', 'overmotivated-idle', 'out-of-type', 'driven-from-outside', 'unexplained-beneficiary', 'plot-hole', 'unearned-change', 'flat', 'spiral', 'dormant-wound', 'pivot', 'exposure', 'leak', 'open-account', 'ambiguous-deed', 'avoidance'];
export { FEELINGS };
