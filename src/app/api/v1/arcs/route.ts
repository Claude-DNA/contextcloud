import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ arcs: [] });
  }

  const res = await query(
    'SELECT * FROM arcs WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return NextResponse.json({ arcs: res.rows });
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
  const { name, description } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const res = await query(
    `INSERT INTO arcs (user_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, name, description || null]
  );

  return NextResponse.json({ arc: res.rows[0] }, { status: 201 });
}
