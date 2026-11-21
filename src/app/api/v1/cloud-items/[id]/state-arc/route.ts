import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { arcFormula, upsertArc, type ArcEntry } from '@/lib/state-arc';

/** GET /api/v1/cloud-items/{id}/state-arc → { id, title, content, cloud_type, project_id, state_arc } */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  const { id } = await params;
  const row = (await query(`SELECT id, title, content, cloud_type, project_id, metadata FROM cloud_items WHERE id = $1 AND user_id = $2`, [id, userId])).rows[0] as
    { id: string; title: string; content: string; cloud_type: string; project_id: string | null; metadata: { state_arc?: ArcEntry[] } | null } | undefined;
  if (!row) return NextResponse.json({ error: 'No such item.' }, { status: 404 });
  return NextResponse.json({ id: row.id, title: row.title, content: row.content, cloud_type: row.cloud_type, project_id: row.project_id, state_arc: Array.isArray(row.metadata?.state_arc) ? row.metadata!.state_arc : [] });
}

/**
 * POST /api/v1/cloud-items/{id}/state-arc
 * { beat: scene title, beat_number?, state: what the character is like now, formula: { base, missing?, modifier?, intensity? }, audition?: a take }
 * Pins this state to the character in that scene: it replaces the scene's entry in the arc, and graph building keeps it.
 * → { state_arc }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const beat = s(body.beat, 200);
  const formula = arcFormula(body.formula);
  if (!beat) return NextResponse.json({ error: 'Name the scene ("beat").' }, { status: 400 });
  if (!formula) return NextResponse.json({ error: 'The state needs at least one feeling.' }, { status: 400 });
  const row = (await query(`SELECT cloud_type, metadata FROM cloud_items WHERE id = $1 AND user_id = $2`, [id, userId])).rows[0] as { cloud_type: string; metadata: { state_arc?: ArcEntry[] } | null } | undefined;
  if (!row) return NextResponse.json({ error: 'No such character.' }, { status: 404 });
  if (row.cloud_type !== 'characters') return NextResponse.json({ error: 'States belong to characters.' }, { status: 400 });
  const n = Number(body.beat_number);
  const arc = Array.isArray(row.metadata?.state_arc) ? row.metadata!.state_arc : [];
  const previous = arc.find((e) => e.beat.trim().toLowerCase() === beat.toLowerCase());
  const entry: ArcEntry = {
    beat,
    ...(Number.isFinite(n) && n > 0 ? { beat_number: n } : previous?.beat_number ? { beat_number: previous.beat_number } : {}),
    state: s(body.state, 400) || previous?.state || formula.formula!,
    delta: previous?.delta || 'unchanged',
    ...formula,
    pinned: true,
    ...(s(body.audition, 600) ? { audition: s(body.audition, 600) } : {}),
  };
  const next = upsertArc(arc, entry);
  await query(`UPDATE cloud_items SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('state_arc', $1::jsonb), updated_at = NOW() WHERE id = $2 AND user_id = $3`, [JSON.stringify(next), id, userId]);
  return NextResponse.json({ state_arc: next, entry });
}
