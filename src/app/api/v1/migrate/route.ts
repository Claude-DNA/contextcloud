import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { runMigrations } from '@/lib/migrations';

const ADMIN_EMAIL = 'baldnewguy@gmail.com';

/** Re-runs every migration. Admins only; normal startup runs them automatically. */
export async function POST() {
  const session = await auth();
  const user = session?.user as { email?: string | null; role?: string } | undefined;
  if (!user || (user.email !== ADMIN_EMAIL && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const ok = await runMigrations();
  return ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: 'Migration failed' }, { status: 500 });
}
