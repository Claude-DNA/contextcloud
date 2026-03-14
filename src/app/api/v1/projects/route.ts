import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// GET /api/v1/projects — all projects for the logged-in user with item counts
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database temporarily unavailable', projects: [] }, { status: 503 });
  }

  await runMigrations();

  const res = await query(
    `SELECT p.id, p.title, p.description, p.created_at,
            COALESCE(c.item_count, 0)::int AS item_count
     FROM projects p
     LEFT JOIN (
       SELECT project_id, COUNT(*) AS item_count
       FROM cloud_items
       WHERE project_id IS NOT NULL
       GROUP BY project_id
     ) c ON c.project_id = p.id
     WHERE p.user_id = $1
     ORDER BY p.created_at ASC`,
    [session.user.id]
  );

  return NextResponse.json({ projects: res.rows });
}

// POST /api/v1/projects — create a project
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await runMigrations();

  const body = await req.json();
  const { title, description = '' } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const res = await query(
    `INSERT INTO projects (user_id, title, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [session.user.id, title.trim(), description]
  );

  return NextResponse.json({ project: res.rows[0] }, { status: 201 });
}
