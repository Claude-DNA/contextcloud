import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// POST /api/v1/arc-scenes/attach — attach a cloud item to an arc scene (idempotent)
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await runMigrations();

  const body = await req.json();
  const { cloud_item_id, arc_item_id } = body;

  if (!cloud_item_id || !arc_item_id) {
    return NextResponse.json({ error: 'cloud_item_id and arc_item_id are required' }, { status: 400 });
  }

  // Verify both items belong to this user and arc_item_id is actually an arc item
  const verify = await query(
    `SELECT id, cloud_type FROM cloud_items WHERE id = ANY($1) AND user_id = $2`,
    [[cloud_item_id, arc_item_id], userId]
  );

  if (verify.rows.length < 2) {
    return NextResponse.json({ error: 'One or both items not found' }, { status: 404 });
  }

  const arcRow = verify.rows.find((r: { id: string; cloud_type: string }) => r.id === arc_item_id);
  if (!arcRow || arcRow.cloud_type !== 'arc') {
    return NextResponse.json({ error: 'arc_item_id must reference an arc item' }, { status: 400 });
  }

  await query(
    `INSERT INTO cloud_item_scenes (cloud_item_id, arc_item_id)
     VALUES ($1, $2)
     ON CONFLICT (cloud_item_id, arc_item_id) DO NOTHING`,
    [cloud_item_id, arc_item_id]
  );

  return NextResponse.json({ ok: true });
}

// DELETE /api/v1/arc-scenes/attach — detach a cloud item from an arc scene
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await runMigrations();

  const body = await req.json();
  const { cloud_item_id, arc_item_id } = body;

  if (!cloud_item_id || !arc_item_id) {
    return NextResponse.json({ error: 'cloud_item_id and arc_item_id are required' }, { status: 400 });
  }

  // Verify the arc item belongs to this user
  const verify = await query(
    `SELECT id FROM cloud_items WHERE id = $1 AND user_id = $2 AND cloud_type = 'arc'`,
    [arc_item_id, userId]
  );

  if (verify.rows.length === 0) {
    return NextResponse.json({ error: 'Arc item not found' }, { status: 404 });
  }

  const res = await query(
    `DELETE FROM cloud_item_scenes WHERE cloud_item_id = $1 AND arc_item_id = $2`,
    [cloud_item_id, arc_item_id]
  );

  return NextResponse.json({ ok: true, deleted: res.rowCount ?? 0 });
}
