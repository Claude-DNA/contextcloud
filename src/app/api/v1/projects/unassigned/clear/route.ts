import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

// DELETE /api/v1/projects/unassigned/clear
// Deletes all cloud_items with project_id IS NULL for the logged-in user.
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const res = await query(
    'DELETE FROM cloud_items WHERE user_id = $1 AND project_id IS NULL',
    [userId]
  );

  return NextResponse.json({ ok: true, deleted: res.rowCount ?? 0 });
}
