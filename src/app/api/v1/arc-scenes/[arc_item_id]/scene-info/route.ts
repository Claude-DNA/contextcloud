import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// GET /api/v1/arc-scenes/[arc_item_id]/scene-info — returns arc item info (id, title, content)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ arc_item_id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  }

  await runMigrations();

  const { arc_item_id } = await params;

  const res = await query(
    `SELECT id, title, content FROM cloud_items WHERE id = $1 AND user_id = $2 AND cloud_type = 'arc'`,
    [arc_item_id, session.user.id]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Arc scene not found' }, { status: 404 });
  }

  return NextResponse.json(res.rows[0]);
}
