import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  // Verify plot belongs to user via chapter → arc
  const res = await query(
    `SELECT p.* FROM plots p
     JOIN chapters c ON p.chapter_id = c.id
     JOIN arcs a ON c.arc_id = a.id
     WHERE p.id = $1 AND a.user_id = $2`,
    [id, session.user.id]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
  }

  return NextResponse.json({ plot: res.rows[0] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  // Verify plot belongs to user
  const plotCheck = await query(
    `SELECT p.id FROM plots p
     JOIN chapters c ON p.chapter_id = c.id
     JOIN arcs a ON c.arc_id = a.id
     WHERE p.id = $1 AND a.user_id = $2`,
    [id, session.user.id]
  );
  if (plotCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
  }

  const body = await req.json();
  const { name, content, active_alternative_id } = body;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
  if (content !== undefined) { sets.push(`content = $${i++}`); vals.push(content); }
  if (active_alternative_id !== undefined) { sets.push(`active_alternative_id = $${i++}`); vals.push(active_alternative_id); }
  sets.push('updated_at = NOW()');

  if (sets.length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  vals.push(id);

  const res = await query(
    `UPDATE plots SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );

  return NextResponse.json({ plot: res.rows[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  // Verify plot belongs to user
  const plotCheck = await query(
    `SELECT p.id FROM plots p
     JOIN chapters c ON p.chapter_id = c.id
     JOIN arcs a ON c.arc_id = a.id
     WHERE p.id = $1 AND a.user_id = $2`,
    [id, session.user.id]
  );
  if (plotCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
  }

  await query('DELETE FROM plots WHERE id = $1', [id]);

  return NextResponse.json({ success: true });
}
