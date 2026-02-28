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
    return NextResponse.json({ transformations: [] });
  }

  const { id } = await params;

  // Verify idea belongs to user
  const ideaRes = await query(
    'SELECT id FROM ideas WHERE id = $1 AND project_id = $2',
    [id, session.user.id]
  );
  if (ideaRes.rows.length === 0) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  }

  const res = await query(
    'SELECT * FROM idea_transformations WHERE idea_id = $1 ORDER BY created_at ASC',
    [id]
  );

  return NextResponse.json({ transformations: res.rows });
}

export async function POST(
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

  // Verify idea belongs to user
  const ideaRes = await query(
    'SELECT id FROM ideas WHERE id = $1 AND project_id = $2',
    [id, session.user.id]
  );
  if (ideaRes.rows.length === 0) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  }

  const body = await req.json();
  const { text, weight, transform_type, source_node_id, source_node_level } = body;

  if (!text) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  const res = await query(
    `INSERT INTO idea_transformations (idea_id, text, weight, transform_type, source_node_id, source_node_level)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, text, weight || 1.0, transform_type || 'additive', source_node_id || null, source_node_level || null]
  );

  return NextResponse.json({ transformation: res.rows[0] }, { status: 201 });
}
