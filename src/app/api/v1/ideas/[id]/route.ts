import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  const res = await query(
    'SELECT * FROM ideas WHERE id = $1 AND project_id = $2',
    [id, userId]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  }

  return NextResponse.json({ idea: res.rows[0] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json();
  const { text, weight, locked, image_url, final_state_manual } = body;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (text !== undefined) { sets.push(`text = $${i++}`); vals.push(text); }
  if (weight !== undefined) { sets.push(`weight = $${i++}`); vals.push(weight); }
  if (locked !== undefined) { sets.push(`locked = $${i++}`); vals.push(locked); }
  if (image_url !== undefined) { sets.push(`image_url = $${i++}`); vals.push(image_url); }
  if (final_state_manual !== undefined) { sets.push(`final_state_manual = $${i++}`); vals.push(final_state_manual); }
  sets.push('updated_at = NOW()');

  if (sets.length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  vals.push(id);
  vals.push(userId);

  const res = await query(
    `UPDATE ideas SET ${sets.join(', ')} WHERE id = $${i++} AND project_id = $${i} RETURNING *`,
    vals
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  }

  return NextResponse.json({ idea: res.rows[0] });
}

export async function DELETE(req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  await query(
    'DELETE FROM ideas WHERE id = $1 AND project_id = $2',
    [id, userId]
  );

  return NextResponse.json({ success: true });
}
