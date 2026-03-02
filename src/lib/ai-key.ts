import { query } from '@/lib/db';

const ADMIN_EMAIL = 'baldnewguy@gmail.com';

/**
 * Resolves the Gemini API key for a given user.
 * - User has a stored key → use it
 * - User is admin → fall back to env var
 * - Otherwise → null (BYOT required)
 */
export async function getGeminiKey(
  userId: string,
  userEmail?: string | null
): Promise<string | null> {
  try {
    const res = await query(
      'SELECT google_ai_key FROM users WHERE id = $1',
      [userId]
    );
    const stored = res.rows[0]?.google_ai_key as string | null;
    if (stored && stored.trim().length > 0) return stored.trim();
  } catch {
    // If column doesn't exist yet (pre-migration), fall through
  }

  // Admin fallback
  if (userEmail === ADMIN_EMAIL || userId === ADMIN_EMAIL) {
    return process.env.GOOGLE_AI_API_KEY || null;
  }

  return null;
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
