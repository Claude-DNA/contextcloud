import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }
  await runMigrations();

  const res = await query(
    'SELECT google_ai_key FROM users WHERE id = $1',
    [session.user.id]
  );
  const row = res.rows[0];
  const hasKey = !!(row?.google_ai_key && row.google_ai_key.trim().length > 0);
  // Return masked key — never expose raw key to client
  return NextResponse.json({ hasKey, keyPreview: hasKey ? '••••••••' + row.google_ai_key.slice(-4) : null });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }
  await runMigrations();

  const { googleAiKey } = await req.json();
  const key = (googleAiKey || '').trim();

  await query(
    'UPDATE users SET google_ai_key = $1 WHERE id = $2',
    [key || null, session.user.id]
  );

  return NextResponse.json({ ok: true, hasKey: key.length > 0 });
}
