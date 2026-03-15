/**
 * api-auth.ts — unified auth helper for Context Cloud API routes.
 *
 * Supports two auth methods (checked in order):
 *   1. NextAuth session (existing browser-based auth)
 *   2. Bearer API key   — Authorization: Bearer cc_live_<token>
 *
 * Usage in route handlers:
 *   const userId = await getAuthUserId(req);
 *   if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
 */

import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query } from '@/lib/db';

const KEY_PREFIX = 'cc_live_';

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function getAuthUserId(req: NextRequest): Promise<string | null> {
  // 1. Try session (existing browser auth)
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  // 2. Try Bearer API key
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  if (!token.startsWith(KEY_PREFIX)) return null;

  const hash = createHash('sha256').update(token).digest('hex');

  try {
    const result = await query(
      `UPDATE user_api_keys
         SET last_used_at = NOW()
       WHERE key_hash = $1 AND is_active = TRUE
       RETURNING user_id`,
      [hash]
    );
    return (result.rows[0]?.user_id as string) ?? null;
  } catch {
    return null;
  }
}

// ── Key generation ────────────────────────────────────────────────────────────

/** Generate a new API key. Returns the full plaintext key (show once) and its prefix for display. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const token = KEY_PREFIX + randomBytes(24).toString('hex'); // cc_live_ + 48 hex chars
  const prefix = token.slice(0, 16) + '…';                   // "cc_live_ab12cd34…"
  const hash = createHash('sha256').update(token).digest('hex');
  return { key: token, prefix, hash };
}
