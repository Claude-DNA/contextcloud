import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

const VALID_TYPES = ['characters', 'references', 'scenes', 'world', 'ideas', 'arc'] as const;
type CloudType = typeof VALID_TYPES[number];

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const cloudType = req.nextUrl.searchParams.get('type') as CloudType | null;
  if (!cloudType || !VALID_TYPES.includes(cloudType)) {
    return NextResponse.json({ error: 'Invalid cloud type' }, { status: 400 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database temporarily unavailable — please retry in a moment', items: [] }, { status: 503 });
  }

  await runMigrations();

  const projectId = req.nextUrl.searchParams.get('project_id');
  let sql = 'SELECT * FROM cloud_items WHERE user_id = $1 AND cloud_type = $2';
  const params: unknown[] = [userId, cloudType];

  if (projectId === 'unassigned') {
    sql += ' AND project_id IS NULL';
  } else if (projectId) {
    // Include items for this project AND items with no project (global/pre-project items)
    sql += ' AND (project_id = $3 OR project_id IS NULL)';
    params.push(projectId);
  }

  sql += ' ORDER BY sort_order ASC, created_at ASC';
  const res = await query(sql, params);

  return NextResponse.json({ items: res.rows });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await runMigrations();

  const body = await req.json();
  const { cloud_type, title, content = '', tags = [], metadata = {}, project_id } = body;

  if (!cloud_type || !VALID_TYPES.includes(cloud_type)) {
    return NextResponse.json({ error: 'Invalid cloud type' }, { status: 400 });
  }
  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const maxRes = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM cloud_items WHERE user_id = $1 AND cloud_type = $2',
    [userId, cloud_type]
  );
  const nextOrder = maxRes.rows[0]?.next_order ?? 0;

  const res = await query(
    `INSERT INTO cloud_items (user_id, cloud_type, title, content, tags, metadata, sort_order, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, cloud_type, title.trim(), content, tags, JSON.stringify(metadata), nextOrder, project_id || null]
  );

  return NextResponse.json({ item: res.rows[0] }, { status: 201 });
}

// DELETE ?type=characters — clears all items of a cloud type for this user
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }
  await runMigrations();

  const cloudType = req.nextUrl.searchParams.get('type') as CloudType | null;
  if (!cloudType || !VALID_TYPES.includes(cloudType)) {
    return NextResponse.json({ error: 'Invalid cloud type' }, { status: 400 });
  }
  const res = await query(
    'DELETE FROM cloud_items WHERE user_id=$1 AND cloud_type=$2',
    [userId, cloudType]
  );
  return NextResponse.json({ ok: true, deleted: res.rowCount ?? 0 });
}
