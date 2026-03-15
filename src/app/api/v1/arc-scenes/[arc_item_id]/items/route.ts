import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// GET /api/v1/arc-scenes/[arc_item_id]/items — all items attached to this arc scene, grouped by cloud_type
export async function GET(req: NextRequest,
  { params }: { params: Promise<{ arc_item_id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  }

  await runMigrations();

  const { arc_item_id } = await params;

  // Verify arc item belongs to user
  const arcCheck = await query(
    `SELECT id FROM cloud_items WHERE id = $1 AND user_id = $2 AND cloud_type = 'arc'`,
    [arc_item_id, userId]
  );

  if (arcCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Arc scene not found' }, { status: 404 });
  }

  const res = await query(
    `SELECT ci.id, ci.title, ci.content, ci.cloud_type, ci.tags, ci.metadata, ci.sort_order
     FROM cloud_item_scenes cis
     JOIN cloud_items ci ON ci.id = cis.cloud_item_id
     WHERE cis.arc_item_id = $1
     ORDER BY ci.cloud_type ASC, ci.sort_order ASC, ci.created_at ASC`,
    [arc_item_id]
  );

  // Group by cloud_type
  const grouped: Record<string, typeof res.rows> = {};
  for (const row of res.rows) {
    const type = row.cloud_type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(row);
  }

  return NextResponse.json({ items: res.rows, grouped });
}
