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

  // Verify arc belongs to user
  const arcRes = await query(
    'SELECT id FROM arcs WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (arcRes.rows.length === 0) {
    return NextResponse.json({ error: 'Arc not found' }, { status: 404 });
  }

  // Get chapters with their plots
  const chaptersRes = await query(
    'SELECT * FROM chapters WHERE arc_id = $1 ORDER BY sort_order ASC, created_at ASC',
    [id]
  );

  const chapters = [];
  for (const chapter of chaptersRes.rows) {
    const plotsRes = await query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM plot_alternatives WHERE plot_id = p.id) as alternatives_count
       FROM plots p
       WHERE p.chapter_id = $1
       ORDER BY p.sort_order ASC, p.created_at ASC`,
      [chapter.id]
    );
    chapters.push({
      ...chapter,
      plots: plotsRes.rows,
    });
  }

  return NextResponse.json({ chapters });
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

  // Verify arc belongs to user
  const arcRes = await query(
    'SELECT id FROM arcs WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (arcRes.rows.length === 0) {
    return NextResponse.json({ error: 'Arc not found' }, { status: 404 });
  }

  const body = await req.json();
  const { name } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // Get next sort order
  const maxRes = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM chapters WHERE arc_id = $1',
    [id]
  );

  const res = await query(
    `INSERT INTO chapters (arc_id, name, sort_order)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, name, maxRes.rows[0].next_order]
  );

  return NextResponse.json({ chapter: res.rows[0] }, { status: 201 });
}
