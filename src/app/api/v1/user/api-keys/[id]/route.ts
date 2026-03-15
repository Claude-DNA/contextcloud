import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query } from '@/lib/db';

// DELETE /api/v1/user/api-keys/[id] — revoke a key (sets is_active = false)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;

  const result = await query(
    `UPDATE user_api_keys
        SET is_active = FALSE
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, session.user.id]
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
