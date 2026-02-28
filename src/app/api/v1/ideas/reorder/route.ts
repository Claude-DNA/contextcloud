import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const body = await req.json();
  const { orderedIds } = body;

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds array is required' }, { status: 400 });
  }

  // Update sort_order for each idea
  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      'UPDATE ideas SET sort_order = $1 WHERE id = $2 AND project_id = $3',
      [i, orderedIds[i], session.user.id]
    );
  }

  return NextResponse.json({ success: true });
}
