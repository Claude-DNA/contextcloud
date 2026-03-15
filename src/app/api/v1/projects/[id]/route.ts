import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// PATCH /api/v1/projects/[id] — update project
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await runMigrations();

  const { id } = await params;
  const body = await req.json();

  // Verify ownership
  const existing = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let p = 1;

  if (body.title !== undefined) {
    sets.push(`title = $${p++}`);
    values.push(body.title.trim());
  }
  if (body.description !== undefined) {
    sets.push(`description = $${p++}`);
    values.push(body.description);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  sets.push(`updated_at = NOW()`);
  values.push(id);

  const res = await query(
    `UPDATE projects SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
    values
  );

  return NextResponse.json({ project: res.rows[0] });
}

// DELETE /api/v1/projects/[id] — delete project (ON DELETE SET NULL handles cloud_items)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await runMigrations();

  const { id } = await params;

  const res = await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
  if ((res.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
