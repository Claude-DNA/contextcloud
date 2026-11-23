/** Character State Engine — vector math and the seeded random generator. */
import type { Effect } from './types';

export const clamp = (x: number, lo = 0, hi = 1) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo);
export const clamp1 = (x: number) => clamp(x, -1, 1);
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

const keys = (...vs: Effect[]) => [...new Set(vs.flatMap((v) => Object.keys(v)))];

export function norm(v: Effect): number {
  let s = 0;
  for (const k in v) s += v[k] * v[k];
  return Math.sqrt(s);
}

export function dot(a: Effect, b: Effect): number {
  let s = 0;
  for (const k in a) if (k in b) s += a[k] * b[k];
  return s;
}

export function cosine(a: Effect, b: Effect): number | null {
  const na = norm(a), nb = norm(b);
  if (na < 1e-9 || nb < 1e-9) return null;
  return clamp1(dot(a, b) / (na * nb));
}

export function add(a: Effect, b: Effect, scale = 1): Effect {
  const out: Effect = { ...a };
  for (const k in b) out[k] = (out[k] ?? 0) + b[k] * scale;
  return out;
}

export function scale(a: Effect, s: number): Effect {
  const out: Effect = {};
  for (const k in a) out[k] = a[k] * s;
  return out;
}

export function mean(vs: Effect[], weights?: number[]): Effect {
  if (!vs.length) return {};
  const w = weights ?? vs.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0) || 1;
  const out: Effect = {};
  for (const k of keys(...vs)) out[k] = vs.reduce((s, v, i) => s + (v[k] ?? 0) * w[i], 0) / total;
  return out;
}

/**
 * Distance between two effect vectors, 0 (the same) … 1 (opposite, or something against nothing).
 * Direction and size both count: promising $10 and giving $10,000 are far apart.
 */
export function distance(x: Effect, y: Effect, lambda = 0.7): number {
  const nx = norm(x), ny = norm(y);
  if (nx < 1e-9 && ny < 1e-9) return 0;
  const c = cosine(x, y);
  const dir = c === null ? 0.5 : (1 - c) / 2;
  const size = Math.abs(nx - ny) / Math.max(nx, ny);
  return clamp(lambda * dir + (1 - lambda) * size);
}

/** The story's moral reading of an effect vector, −1…+1: effects on others, weighted. */
export function moralScore(e: Effect, self: string, weights: Record<string, number>): number {
  let s = 0;
  for (const k in e) if (k !== self) s += (weights[k] ?? 1) * e[k];
  return Math.tanh(1.5 * s);
}

/** A deterministic hash of strings, for seeding. */
export function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator. One per purpose, so adding a roll elsewhere never shifts this one. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One seeded roll in 0…1 for a named purpose. */
export const roll = (seed: number, ...purpose: (string | number)[]) => rng(hash(seed, ...purpose))();

/** One seeded normal-ish draw (mean 0, sd ≈ 1). */
export function gauss(seed: number, ...purpose: (string | number)[]): number {
  const r = rng(hash(seed, ...purpose));
  return (r() + r() + r() + r() - 2) * Math.sqrt(3);
}

/** Softmax with temperature. */
export function softmax(scores: number[], t: number): number[] {
  const tt = Math.max(0.02, t);
  const m = Math.max(...scores);
  const ex = scores.map((s) => Math.exp((s - m) / tt));
  const z = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / z);
}
