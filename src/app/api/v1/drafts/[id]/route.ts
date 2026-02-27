import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const res = await query(
    'SELECT * FROM cloud_drafts WHERE id = $1 AND user_id = $2',
    [id, session.user.id]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  return NextResponse.json({ draft: res.rows[0] });
}
