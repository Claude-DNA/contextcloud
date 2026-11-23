import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { loadProjectItems, loadSettings, projectParam, saveSettings } from '@/lib/engine/server';
import { readSettings } from '@/lib/engine';

/** GET: the project's characters and scenes with their engine data, and the engine settings. */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const projectId = projectParam(req.nextUrl.searchParams.get('project_id'));
  const [items, settings] = await Promise.all([loadProjectItems(userId, projectId), loadSettings(userId, projectId)]);
  const engineOf = (m: Record<string, unknown> | null) => (m?.engine && typeof m.engine === 'object' ? m.engine : {});
  return NextResponse.json({
    characters: items.filter((i) => i.cloud_type === 'characters').map((i) => ({ id: i.id, title: i.title, content: (i.content ?? '').slice(0, 1200), engine: engineOf(i.metadata) })),
    scenes: items.filter((i) => i.cloud_type === 'arc').map((i) => ({ id: i.id, title: i.title, content: (i.content ?? '').slice(0, 3000), when: (i.metadata as Record<string, unknown> | null)?.when ?? null, engine: engineOf(i.metadata) })),
    settings: readSettings(settings),
  });
}

/** PUT: save the engine settings for a project. */
export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const body = (await req.json().catch(() => ({}))) as { project_id?: string; settings?: unknown };
  const projectId = projectParam(body.project_id);
  if (!projectId) return NextResponse.json({ error: 'Open a project to save engine settings.' }, { status: 400 });
  const settings = readSettings(body.settings);
  const ok = await saveSettings(userId, projectId, settings as unknown as Record<string, unknown>);
  return ok ? NextResponse.json({ settings }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
