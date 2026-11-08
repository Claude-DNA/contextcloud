import { query } from '@/lib/db';
import { open } from '@/lib/secret-box';
import { isAdmin } from '@/lib/admin';
import { PROVIDERS, PROVIDER_INFO, type AiConfig, type Provider } from '@/lib/ai';

/** Server keys, used only for the admin account (never for other users). */
const SERVER_KEYS: Record<Provider, string | undefined> = {
  google: process.env.GOOGLE_AI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
};

interface UserAiRow {
  ai_provider: string | null;
  ai_model: string | null;
  ai_model_light: string | null;
  ai_keys: Record<string, string> | null;
  google_ai_key: string | null;
  email: string | null;
  role: string | null;
  email_verified: boolean | null;
}

export async function loadAiRow(userId: string): Promise<UserAiRow | null> {
  const res = await query(
    `SELECT ai_provider, ai_model, ai_model_light, ai_keys, google_ai_key, email, role, email_verified
     FROM users WHERE id = $1`,
    [userId]
  );
  return (res.rows[0] as UserAiRow | undefined) ?? null;
}

/** The user's own key for a provider (decrypted), or the server key if they are the admin. */
export function keyFor(row: UserAiRow, provider: Provider): string | null {
  const sealed = row.ai_keys?.[provider] || (provider === 'google' ? row.google_ai_key : null);
  const own = sealed?.trim() ? open(sealed.trim()) : '';
  if (own) return own;
  const admin = isAdmin({ email: row.email, role: row.role ?? undefined, emailVerified: row.email_verified ?? false });
  return admin ? SERVER_KEYS[provider] || null : null;
}

/** The provider in use: the one chosen, else the first with a key. */
export function providerFor(row: UserAiRow): Provider {
  if (row.ai_provider && (PROVIDERS as string[]).includes(row.ai_provider)) return row.ai_provider as Provider;
  return PROVIDERS.find((p) => keyFor(row, p)) ?? 'google';
}

/**
 * Resolves the AI config for a user: provider, key, model, light model.
 * Null when there is no key for the provider or no model chosen (OpenAI and OpenRouter have no default).
 */
export async function getAiConfig(userId: string): Promise<AiConfig | null> {
  try {
    const row = await loadAiRow(userId);
    if (!row) return null;
    const provider = providerFor(row);
    const apiKey = keyFor(row, provider);
    if (!apiKey) return null;
    const info = PROVIDER_INFO[provider];
    const model = row.ai_model || info.defaultModel || '';
    if (!model) return null;
    return { provider, apiKey, model, lightModel: row.ai_model_light || info.defaultLight || model };
  } catch {
    return null;
  }
}

export function noKeyResponse() {
  return Response.json(
    {
      error: 'AI key required',
      message:
        'Add an API key in Settings to use AI features. You can use Google Gemini, Anthropic Claude, OpenAI or OpenRouter, and choose the model.',
      code: 'BYOT_REQUIRED',
    },
    { status: 402 }
  );
}

/** A provider error as a response the client can show. */
export function aiErrorResponse(e: unknown, what = 'The AI request failed') {
  const details = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  const hint =
    status === 401 || status === 403
      ? 'Your API key was rejected. Check it in Settings.'
      : status === 404
        ? 'The model was not found. Choose another in Settings.'
        : status === 429
          ? 'The provider is rate-limiting this key. Wait a minute and try again.'
          : undefined;
  return Response.json({ error: what, message: hint, details }, { status: 502 });
}
