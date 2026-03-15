import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';

// DELETE /api/v1/projects/unassigned/clear
// Deletes all cloud_items with project_id IS NULL for the logged-in user.
export async function DELETE(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const res = await query(
    'DELETE FROM cloud_items WHERE user_id = $1 AND project_id IS NULL',
    [session.user.id]
  );

  return NextResponse.json({ ok: true, deleted: res.rowCount ?? 0 });
}
