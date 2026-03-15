import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }
  const { id } = await params;
  await query('DELETE FROM cloud_items WHERE id=$1 AND user_id=$2', [id, userId]);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json();
  const { title, content, tags, metadata } = body;

  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let i = 1;

  if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title); }
  if (content !== undefined) { sets.push(`content = $${i++}`); vals.push(content); }
  if (tags !== undefined) { sets.push(`tags = $${i++}`); vals.push(tags); }
  if (metadata !== undefined) { sets.push(`metadata = $${i++}`); vals.push(JSON.stringify(metadata)); }

  vals.push(id, userId);

  const res = await query(
    `UPDATE cloud_items SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals
  );

  if (!res.rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ item: res.rows[0] });
}
