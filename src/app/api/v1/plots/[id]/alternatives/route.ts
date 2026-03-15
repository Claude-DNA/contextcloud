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

  // Verify plot belongs to user
  const plotCheck = await query(
    `SELECT p.id, p.active_alternative_id FROM plots p
     JOIN chapters c ON p.chapter_id = c.id
     JOIN arcs a ON c.arc_id = a.id
     WHERE p.id = $1 AND a.user_id = $2`,
    [id, userId]
  );
  if (plotCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
  }

  const res = await query(
    'SELECT * FROM plot_alternatives WHERE plot_id = $1 ORDER BY created_at ASC',
    [id]
  );

  return NextResponse.json({
    alternatives: res.rows,
    active_alternative_id: plotCheck.rows[0].active_alternative_id,
  });
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

  // Verify plot belongs to user
  const plotCheck = await query(
    `SELECT p.id FROM plots p
     JOIN chapters c ON p.chapter_id = c.id
     JOIN arcs a ON c.arc_id = a.id
     WHERE p.id = $1 AND a.user_id = $2`,
    [id, userId]
  );
  if (plotCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
  }

  const body = await req.json();
  const { name, content } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const res = await query(
    `INSERT INTO plot_alternatives (plot_id, name, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, name, content || null]
  );

  return NextResponse.json({ alternative: res.rows[0] }, { status: 201 });
}
