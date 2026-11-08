import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { rowToIdea, titleFrom, IDEA_COLUMNS, type IdeaRow } from '@/lib/ideas-adapter';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  const { id } = await params;
  const res = await query(`SELECT ${IDEA_COLUMNS} FROM cloud_items WHERE id = $1 AND user_id = $2 AND cloud_type = 'ideas'`, [id, userId]);
  if (!res.rows.length) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  return NextResponse.json({ idea: rowToIdea(res.rows[0] as IdeaRow) });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  const { id } = await params;
  const { text, weight, locked, image_url, final_state_manual } = await req.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (typeof text === 'string') {
    sets.push(`content = $${i++}`, `title = $${i++}`);
    vals.push(text, titleFrom(text));
  }
  const metaPatch: Record<string, unknown> = {};
  if (weight !== undefined) metaPatch.weight = Number(weight);
  if (locked !== undefined) metaPatch.locked = Boolean(locked);
  if (image_url !== undefined) metaPatch.image_url = image_url || null;
  if (Object.keys(metaPatch).length) {
    sets.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${i++}::jsonb`);
    vals.push(JSON.stringify(metaPatch));
  }
  if (final_state_manual !== undefined) {
    sets.push(`final_state_manual = $${i++}`);
    vals.push(final_state_manual);
  }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  sets.push('updated_at = NOW()');
  vals.push(id, userId);
  const res = await query(
    `UPDATE cloud_items SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} AND cloud_type = 'ideas' RETURNING ${IDEA_COLUMNS}`,
    vals
  );
  if (!res.rows.length) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  return NextResponse.json({ idea: rowToIdea(res.rows[0] as IdeaRow) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  const { id } = await params;
  await query(`DELETE FROM cloud_items WHERE id = $1 AND user_id = $2 AND cloud_type = 'ideas'`, [id, userId]);
  return NextResponse.json({ success: true });
}
