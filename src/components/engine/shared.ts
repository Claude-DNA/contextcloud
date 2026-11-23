'use client';
/** Shared pieces of the Character Engine and Character Generator pages. */
import type { Agenda, Deed, Identity, StoryEvent } from '@/lib/engine/types';

export const field = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40';
export const small = 'rounded-md border border-border bg-white px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40';
export const label = 'block text-xs font-medium text-muted mb-1';
export const button = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const primary = `${button} bg-accent text-white hover:bg-accent-hover`;
export const secondary = `${button} border border-border text-foreground hover:bg-gray-50`;
export const link = 'text-xs font-medium text-accent hover:underline disabled:opacity-50';

export interface EngineCharacter {
  id: string;
  title: string;
  content: string;
  engine: { identity?: Identity; declared?: Agenda | null; real?: Agenda[]; roles?: Record<string, string> };
}

export type Proposed<T> = T & { confidence?: number };
export interface SceneReading { present: string[]; events: Proposed<StoryEvent>[]; deeds: Proposed<Deed>[]; at?: string }

export interface EngineScene {
  id: string;
  title: string;
  content: string;
  when: string | null;
  engine: { proposed?: SceneReading; approved?: SceneReading };
}

export const WORLD_ID = 'world';

/** A short "Boris −0.6, Anna +0.3" line. */
export function effectLine(effect: Record<string, number>, name: (id: string) => string): string {
  return Object.entries(effect)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v]) => `${name(k)} ${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`)
    .join(', ');
}

/** Saves a file to the writer's computer. */
export function download(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fileName = (name: string) => `${name.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_|_$/g, '') || 'character'}.character.json`;

export async function readJsonFile(file: File): Promise<unknown> {
  if (file.size > 500_000) throw new Error('too big');
  return JSON.parse(await file.text());
}
