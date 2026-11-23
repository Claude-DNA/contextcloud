import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { loadItem, mergeEngine } from '@/lib/engine/server';
import { readAgenda, readIdentity } from '@/lib/engine';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH { engine: { … } }: saves engine data on a character or arc scene, merged into metadata.engine.
 * Characters: identity, declared, real, roles. Scenes: approved, proposed.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  const { id } = await params;
  const item = await loadItem(userId, id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { engine?: Record<string, unknown> };
  const e = body.engine ?? {};
  const patch: Record<string, unknown> = {};
  const size = JSON.stringify(e).length;
  if (size > 200_000) return NextResponse.json({ error: 'Too much engine data for one item.' }, { status: 413 });

  if (item.cloud_type === 'characters') {
    if ('identity' in e) patch.identity = readIdentity(e.identity);
    if ('declared' in e) patch.declared = e.declared === null ? null : readAgenda(e.declared, 'declared');
    if ('real' in e) patch.real = (Array.isArray(e.real) ? e.real : []).map((a, i) => readAgenda(a, `r${i + 1}`)).filter(Boolean).slice(0, 5);
    if ('roles' in e && e.roles && typeof e.roles === 'object') patch.roles = e.roles;
  } else if (item.cloud_type === 'arc') {
    if ('approved' in e) patch.approved = e.approved;
    if ('proposed' in e) patch.proposed = e.proposed;
  } else {
    return NextResponse.json({ error: 'Engine data goes on characters and arc scenes only.' }, { status: 400 });
  }
  const engine = await mergeEngine(userId, id, patch);
  return engine ? NextResponse.json({ engine }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
