import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';

// DELETE /api/v1/projects/[id]/clear
// Deletes ALL cloud_items belonging to this project for this user.
// The project itself is preserved. Requires ownership check.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  // Verify project ownership
  const ownership = await query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [id, session.user.id]
  );
  if (ownership.rows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Delete all cloud_items for this project (owned by this user — double safety)
  const res = await query(
    'DELETE FROM cloud_items WHERE project_id = $1 AND user_id = $2',
    [id, session.user.id]
  );

  return NextResponse.json({ ok: true, deleted: res.rowCount ?? 0 });
}
