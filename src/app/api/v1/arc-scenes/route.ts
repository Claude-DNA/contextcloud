import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// GET /api/v1/arc-scenes — all arc items for the logged-in user, with attached_count
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database temporarily unavailable', scenes: [] }, { status: 503 });
  }

  await runMigrations();

  const res = await query(
    `SELECT ci.id, ci.title, ci.content, ci.sort_order,
            COALESCE(att.attached_count, 0)::int AS attached_count
     FROM cloud_items ci
     LEFT JOIN (
       SELECT arc_item_id, COUNT(*) AS attached_count
       FROM cloud_item_scenes
       GROUP BY arc_item_id
     ) att ON att.arc_item_id = ci.id
     WHERE ci.user_id = $1 AND ci.cloud_type = 'arc'
     ORDER BY ci.sort_order ASC, ci.created_at ASC`,
    [session.user.id]
  );

  return NextResponse.json({ scenes: res.rows });
}
