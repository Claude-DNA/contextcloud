import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ ideas: [] });
  }

  const res = await query(
    'SELECT * FROM ideas WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC',
    [session.user.id]
  );

  return NextResponse.json({ ideas: res.rows });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
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
    [session.user.id]
  );

  const res = await query(
    `INSERT INTO ideas (project_id, text, weight, image_url, sort_order)
     VALUES ($1, $2, $3, $4, 0)
     RETURNING *`,
    [session.user.id, text, weight || 1.0, image_url || null]
  );

  // Shift existing ideas down
  await query(
    'UPDATE ideas SET sort_order = sort_order + 1 WHERE project_id = $1 AND id != $2',
    [session.user.id, res.rows[0].id]
  );

  return NextResponse.json({ idea: res.rows[0] }, { status: 201 });
}
