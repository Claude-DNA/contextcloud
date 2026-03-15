import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ ideas: [] });
  }

  const res = await query(
    'SELECT * FROM ideas WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC',
    [userId]
  );

  return NextResponse.json({ ideas: res.rows });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const body = await req.json();
  const { text, weight, image_url } = body;

  if (!text) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  // Get max sort_order to insert at top (sort_order = 0 means top)
  const maxRes = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM ideas WHERE project_id = $1',
    [userId]
  );

  const res = await query(
    `INSERT INTO ideas (project_id, text, weight, image_url, sort_order)
     VALUES ($1, $2, $3, $4, 0)
     RETURNING *`,
    [userId, text, weight || 1.0, image_url || null]
  );

  // Shift existing ideas down
  await query(
    'UPDATE ideas SET sort_order = sort_order + 1 WHERE project_id = $1 AND id != $2',
    [userId, res.rows[0].id]
  );

  return NextResponse.json({ idea: res.rows[0] }, { status: 201 });
}

// DELETE ?all=true — clears all ideas for this user
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }
  const all = req.nextUrl.searchParams.get('all');
  if (all !== 'true') {
    return NextResponse.json({ error: 'Pass ?all=true to confirm bulk delete' }, { status: 400 });
  }
  const res = await query('DELETE FROM ideas WHERE project_id=$1', [userId]);
  return NextResponse.json({ ok: true, deleted: res.rowCount ?? 0 });
}
