import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query } from '@/lib/db';
import { generateApiKey } from '@/lib/api-auth';

// GET /api/v1/user/api-keys — list keys for the current user (prefix + metadata, never full key)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const result = await query(
    `SELECT id, label, key_prefix, created_at, last_used_at, is_active
       FROM user_api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [session.user.id]
  );

  return NextResponse.json({ keys: result.rows });
}

// POST /api/v1/user/api-keys — generate a new key
// Body: { label?: string }
// Returns the FULL key once — it cannot be retrieved again
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Max 10 keys per user
  const count = await query(
    `SELECT COUNT(*) FROM user_api_keys WHERE user_id = $1 AND is_active = TRUE`,
    [session.user.id]
  );
  if (parseInt(count.rows[0].count) >= 10) {
    return NextResponse.json({ error: 'Maximum of 10 active API keys reached. Revoke one first.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const label = (body.label as string | undefined)?.slice(0, 64) || 'Unnamed key';

  const { key, prefix, hash } = generateApiKey();

  await query(
    `INSERT INTO user_api_keys (user_id, key_hash, key_prefix, label)
     VALUES ($1, $2, $3, $4)`,
    [session.user.id, hash, prefix, label]
  );

  // Return the full key ONCE — not stored anywhere retrievable
  return NextResponse.json({ key, prefix, label }, { status: 201 });
}
