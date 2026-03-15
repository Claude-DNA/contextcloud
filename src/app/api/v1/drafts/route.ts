import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

let migrated = false;

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ drafts: [] });
  }

  if (!migrated) {
    await runMigrations();
    migrated = true;
  }

  const res = await query(
    'SELECT id, title, description, type, status, tube_id, created_at, updated_at FROM cloud_drafts WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId]
  );

  return NextResponse.json({ drafts: res.rows });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  if (!migrated) {
    await runMigrations();
    migrated = true;
  }

  const body = await req.json();
  const { title, description, type, layers, canvas } = body;

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const res = await query(
    `INSERT INTO cloud_drafts (user_id, title, description, type, layers_json, canvas_json)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     RETURNING id, title, description, type, status, created_at, updated_at`,
    [
      userId,
      title,
      description || '',
      type || 'cloud',
      JSON.stringify(layers || []),
      canvas ? JSON.stringify(canvas) : null,
    ]
  );

  return NextResponse.json({ draft: res.rows[0] }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const body = await req.json();
  const { id, title, description, type, layers, canvas } = body;

  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 });
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (title !== undefined) {
    sets.push(`title = $${i++}`);
    vals.push(title);
  }
  if (description !== undefined) {
    sets.push(`description = $${i++}`);
    vals.push(description);
  }
  if (type !== undefined) {
    sets.push(`type = $${i++}`);
    vals.push(type);
  }
  if (layers !== undefined) {
    sets.push(`layers_json = $${i++}::jsonb`);
    vals.push(JSON.stringify(layers));
  }
  if (canvas !== undefined) {
    sets.push(`canvas_json = $${i++}::jsonb`);
    vals.push(JSON.stringify(canvas));
  }
  sets.push('updated_at = NOW()');

  vals.push(id);
  vals.push(userId);

  const res = await query(
    `UPDATE cloud_drafts SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  return NextResponse.json({ draft: res.rows[0] });
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 });
  }

  await query('DELETE FROM cloud_drafts WHERE id = $1 AND user_id = $2', [id, userId]);

  return NextResponse.json({ success: true });
}
