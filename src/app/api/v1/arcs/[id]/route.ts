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
    'SELECT * FROM arcs WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Arc not found' }, { status: 404 });
  }

  return NextResponse.json({ arc: res.rows[0] });
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
  const { name, description } = body;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
  if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description); }
  sets.push('updated_at = NOW()');

  if (sets.length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  vals.push(id);
  vals.push(userId);

  const res = await query(
    `UPDATE arcs SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Arc not found' }, { status: 404 });
  }

  return NextResponse.json({ arc: res.rows[0] });
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
    'DELETE FROM arcs WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

  return NextResponse.json({ success: true });
}
