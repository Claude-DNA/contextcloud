import { NextResponse } from 'next/server';
import { isDbAvailable, query } from '@/lib/db';

// Lightweight wake-up endpoint — called on page mount to warm DB before first user action
export async function GET() {
  const ok = await isDbAvailable();
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'DB unreachable after retries — check console.prisma.io' }, { status: 503 });
  }
  // Quick sanity check
  try {
    const res = await query('SELECT NOW() as ts');
    return NextResponse.json({ ok: true, ts: res.rows[0]?.ts });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 503 });
  }
}
