import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { seal, open } from '@/lib/secret-box';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }
  await ensureSchema().catch(() => {});

  const res = await query(
    'SELECT google_ai_key FROM users WHERE id = $1',
    [userId]
  );
  const stored = (res.rows[0]?.google_ai_key as string | null)?.trim();
  const key = stored ? open(stored) : null;
  // Masked: the raw key never goes back to the browser.
  return NextResponse.json({ hasKey: Boolean(key), keyPreview: key ? '••••••••' + key.slice(-4) : null });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }
  await ensureSchema().catch(() => {});

  const { googleAiKey } = await req.json();
  const key = (googleAiKey || '').trim();

  // Stored encrypted (AES-256-GCM), never as plain text.
  await query(
    'UPDATE users SET google_ai_key = $1 WHERE id = $2',
    [key ? seal(key) : null, userId]
  );

  return NextResponse.json({ ok: true, hasKey: key.length > 0 });
}
