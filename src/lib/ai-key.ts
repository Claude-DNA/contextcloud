import { query } from '@/lib/db';
import { open } from '@/lib/secret-box';
import { isAdmin } from '@/lib/admin';

/**
 * Resolves the Gemini API key for a given user.
 * - User has a stored key → use it (decrypted)
 * - User is the admin with a verified email, or has the admin role → fall back to the server key
 * - Otherwise → null (BYOT required)
 */
export async function getGeminiKey(
  userId: string,
  userEmail?: string | null
): Promise<string | null> {
  try {
    const res = await query(
      'SELECT google_ai_key, email, role, email_verified FROM users WHERE id = $1',
      [userId]
    );
    const row = res.rows[0];
    if (!row) return null;
    const stored = (row.google_ai_key as string | null)?.trim();
    if (stored) {
      const key = open(stored);
      if (key) return key;
    }
    const admin = isAdmin({
      email: (row.email as string) ?? userEmail ?? null,
      role: row.role as string,
      emailVerified: row.email_verified as boolean,
    });
    return admin ? process.env.GOOGLE_AI_API_KEY || null : null;
  } catch {
    return null;
  }
}

export function noKeyResponse() {
  return Response.json(
    {
      error: 'Google AI API key required',
      message:
        'Please add your Google AI API key in Settings to use AI features. ' +
        'Get a free key at https://aistudio.google.com/app/apikey',
      code: 'BYOT_REQUIRED',
    },
    { status: 402 }
  );
}
