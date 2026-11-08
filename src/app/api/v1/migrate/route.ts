import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { runMigrations } from '@/lib/migrations';
import { isAdmin } from '@/lib/admin';

/** Re-runs every migration. Admins only; normal startup runs them automatically. */
export async function POST() {
  const session = await auth();
  const user = session?.user as { email?: string | null; role?: string; emailVerified?: boolean } | undefined;
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const ok = await runMigrations();
  return ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: 'Migration failed' }, { status: 500 });
}
