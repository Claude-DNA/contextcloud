import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { loadProjectItems, loadSettings, projectParam } from '@/lib/engine/server';
import { WORLD, buildStory, simulate } from '@/lib/engine';
import { getTr } from '@/i18n/server';

/**
 * POST { project_id, settings?, seeds? }: runs the State engine on the approved readings. No AI, no writes.
 * With seeds (up to 20), also returns the spread of runs: how much the story changes between seeds.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const body = (await req.json().catch(() => ({}))) as { project_id?: string; settings?: Record<string, unknown>; seeds?: number };
  const projectId = projectParam(body.project_id);
  const [items, saved] = await Promise.all([loadProjectItems(userId, projectId), loadSettings(userId, projectId)]);
  const story = buildStory(items, { ...saved, ...(body.settings ?? {}) });
  if (!story.beats.length) return NextResponse.json({ error: 'Add arc scenes first: the engine runs along the arc.' }, { status: 400 });
  const t = await getTr();
  story.names[WORLD] = t('the world');
  const result = simulate(story, t);

  let spread: { character: string; good: number; love: number }[] | undefined;
  const n = Math.min(20, Math.max(0, Math.trunc(Number(body.seeds) || 0)));
  if (n > 1) {
    const finals = Array.from({ length: n }, (_, i) => simulate({ ...story, settings: { ...story.settings, seed: story.settings.seed + i } }).beats.at(-1)!.characters);
    spread = Object.keys(story.characters).map((id) => {
      const g = finals.map((f) => f[id].good), l = finals.map((f) => f[id].love);
      const sd = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
      return { character: id, good: Math.round(sd(g) * 1000) / 1000, love: Math.round(sd(l) * 1000) / 1000 };
    });
  }
  return NextResponse.json({ result, names: story.names, settings: story.settings, ...(spread ? { spread } : {}) });
}
