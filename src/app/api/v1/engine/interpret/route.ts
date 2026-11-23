import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { aiErrorResponse, getAiConfig, noKeyResponse } from '@/lib/ai-key';
import { generateJson } from '@/lib/ai';
import { loadItem, loadProjectItems, mergeEngine } from '@/lib/engine/server';
import { INTERPRET_SCHEMA, INTERPRET_SYSTEM, interpretPrompt } from '@/lib/engine/prompts';
import { languageNote } from '@/lib/engine/prompts';
import { requestLocale } from '@/i18n/server';
import { readDeed, readEvent, readInstance } from '@/lib/engine';

export const maxDuration = 120;

const conf = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5; };

/**
 * POST { scene_id }: the Interpretation engine. The AI proposes the scene's events and deeds; they are
 * saved as metadata.engine.proposed on the scene and wait for the author's approval. Nothing is approved here.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const ai = await getAiConfig(userId);
  if (!ai) return noKeyResponse();

  const { scene_id } = (await req.json().catch(() => ({}))) as { scene_id?: string };
  const scene = scene_id ? await loadItem(userId, scene_id) : null;
  if (!scene || scene.cloud_type !== 'arc') return NextResponse.json({ error: 'Scene not found' }, { status: 404 });

  const items = await loadProjectItems(userId, scene.project_id);
  const chars = items.filter((i) => i.cloud_type === 'characters');
  if (!chars.length) return NextResponse.json({ error: 'Add characters to the project first.' }, { status: 400 });
  const scenes = items.filter((i) => i.cloud_type === 'arc');
  const index = scenes.findIndex((s) => s.id === scene.id);
  const known = new Set(chars.map((c) => c.id));
  const cast = chars.map((c) => {
    const inst = readInstance((c.metadata as Record<string, unknown> | null)?.engine, c.title);
    return { id: c.id, name: c.title, about: c.content ?? '', agendas: inst.real.map((a) => a.label).filter(Boolean), declared: inst.declared?.label };
  });

  let raw: { present?: unknown; events?: unknown[]; deeds?: unknown[] };
  try {
    raw = await generateJson({
      ai,
      system: INTERPRET_SYSTEM + languageNote(await requestLocale()),
      prompt: interpretPrompt({ title: scene.title, content: scene.content ?? '', index, total: scenes.length, when: (scene.metadata as Record<string, unknown> | null)?.when as string | null }, cast, scenes.slice(Math.max(0, index - 5), Math.max(0, index)).map((s) => s.title)),
      schema: INTERPRET_SCHEMA,
      temperature: 0.2,
      maxTokens: 6000,
    });
  } catch (e) {
    return aiErrorResponse(e, 'Reading the scene failed');
  }

  const events = (Array.isArray(raw.events) ? raw.events : []).slice(0, 8).map((e, i) => {
    const ev = readEvent(e, known, i);
    return ev ? { ...ev, id: `ai-e${i + 1}`, confidence: conf((e as Record<string, unknown>).confidence) } : null;
  }).filter(Boolean);
  const deeds = (Array.isArray(raw.deeds) ? raw.deeds : []).slice(0, 8).map((d, i) => {
    const o = { ...(d as Record<string, unknown>) };
    if (o.branch === 'none') delete o.branch;
    const deed = readDeed(o, known, i);
    return deed ? { ...deed, id: `ai-d${i + 1}`, confidence: conf(o.confidence) } : null;
  }).filter(Boolean);
  const present = (Array.isArray(raw.present) ? raw.present : []).map(String).filter((id) => known.has(id));
  const proposed = { present, events, deeds, at: new Date().toISOString() };
  await mergeEngine(userId, scene.id, { proposed });
  return NextResponse.json({ proposed });
}
