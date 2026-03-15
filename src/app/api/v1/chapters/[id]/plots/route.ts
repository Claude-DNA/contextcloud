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

  // Verify chapter belongs to user via arc
  const chapterRes = await query(
    `SELECT c.id FROM chapters c
     JOIN arcs a ON c.arc_id = a.id
     WHERE c.id = $1 AND a.user_id = $2`,
    [id, userId]
  );
  if (chapterRes.rows.length === 0) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  const res = await query(
    `SELECT p.*,
      (SELECT COUNT(*) FROM plot_alternatives WHERE plot_id = p.id) as alternatives_count
     FROM plots p
     WHERE p.chapter_id = $1
     ORDER BY p.sort_order ASC, p.created_at ASC`,
    [id]
  );

  return NextResponse.json({ plots: res.rows });
}

export async function POST(
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

  // Verify chapter belongs to user via arc
  const chapterRes = await query(
    `SELECT c.id FROM chapters c
     JOIN arcs a ON c.arc_id = a.id
     WHERE c.id = $1 AND a.user_id = $2`,
    [id, userId]
  );
  if (chapterRes.rows.length === 0) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  const body = await req.json();
  const { name, content } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // Get next sort order
  const maxRes = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM plots WHERE chapter_id = $1',
    [id]
  );

  const res = await query(
    `INSERT INTO plots (chapter_id, name, content, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, name, content || null, maxRes.rows[0].next_order]
  );

  return NextResponse.json({ plot: res.rows[0] }, { status: 201 });
}
