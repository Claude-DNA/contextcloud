import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
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

  // One statement: each id gets its position in the list.
  await query(
    `UPDATE cloud_items c SET sort_order = o.pos - 1
     FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, pos)
     WHERE c.id = o.id AND c.user_id = $2 AND c.cloud_type = 'ideas'`,
    [orderedIds, userId]
  );

  return NextResponse.json({ success: true });
}
