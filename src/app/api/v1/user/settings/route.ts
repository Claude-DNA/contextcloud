import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { seal, open } from '@/lib/secret-box';
import { PROVIDERS, PROVIDER_INFO, type Provider } from '@/lib/ai';
import { loadAiRow, keyFor, providerFor, imageProviderFor } from '@/lib/ai-key';
import { IMAGE_PROVIDERS, IMAGE_DEFAULTS, type ImageProvider } from '@/lib/ai/images';

const mask = (key: string) => '••••' + key.slice(-4);

/**
 * GET → { provider, model, light_model, keys: { google: "••••abcd" | null, … }, server_keys: [providers], providers }
 * Keys are never sent back in full.
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});

  const row = await loadAiRow(userId);
  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const provider = providerFor(row);
  const keys: Record<string, string | null> = {};
  const serverKeys: Provider[] = [];
  for (const p of PROVIDERS) {
    const sealed = row.ai_keys?.[p] || (p === 'google' ? row.google_ai_key : null);
    const own = sealed?.trim() ? open(sealed.trim()) : null;
    keys[p] = own ? mask(own) : null;
    if (!own && keyFor(row, p)) serverKeys.push(p); // admin only
  }
  const info = PROVIDER_INFO[provider];
  const imageProvider = imageProviderFor(row);
  return NextResponse.json({
    image_provider: imageProvider,
    image_model: row.image_model || (imageProvider ? IMAGE_DEFAULTS[imageProvider] : null) || null,
    provider,
    model: row.ai_model || info.defaultModel || null,
    light_model: row.ai_model_light || info.defaultLight || null,
    keys,
    server_keys: serverKeys,
    providers: PROVIDERS.map((p) => ({ id: p, ...PROVIDER_INFO[p] })),
    // Older clients
    hasKey: Boolean(keyFor(row, provider)),
    keyPreview: keys[provider],
  });
}

/**
 * POST { provider?, model?, light_model?, key?: { provider, value } }
 *   value "" removes that provider's key. Changing provider clears the models unless new ones are given.
 * Older clients: { googleAiKey }.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});

  const body = (await req.json().catch(() => ({}))) as {
    provider?: string;
    model?: string | null;
    light_model?: string | null;
    key?: { provider?: string; value?: string };
    googleAiKey?: string;
    image_provider?: string;
    image_model?: string | null;
  };
  const isProvider = (p?: string): p is Provider => !!p && (PROVIDERS as string[]).includes(p);

  const key = body.googleAiKey !== undefined ? { provider: 'google', value: body.googleAiKey } : body.key;
  if (key) {
    if (!isProvider(key.provider)) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    const value = (key.value ?? '').trim();
    if (value.length > 400 || /\s/.test(value)) return NextResponse.json({ error: 'That does not look like an API key' }, { status: 400 });
    if (value) {
      await query(`UPDATE users SET ai_keys = ai_keys || jsonb_build_object($1::text, $2::text) WHERE id = $3`, [key.provider, seal(value), userId]);
    } else {
      await query(`UPDATE users SET ai_keys = ai_keys - $1::text WHERE id = $2`, [key.provider, userId]);
      if (key.provider === 'google') await query(`UPDATE users SET google_ai_key = NULL WHERE id = $1`, [userId]);
    }
  }

  if (body.provider !== undefined) {
    if (!isProvider(body.provider)) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    const row = await loadAiRow(userId);
    if (row && providerFor(row) !== body.provider) {
      // Models belong to a provider: switching clears them unless the request sets new ones.
      await query(`UPDATE users SET ai_provider = $1, ai_model = NULL, ai_model_light = NULL WHERE id = $2`, [body.provider, userId]);
    } else {
      await query(`UPDATE users SET ai_provider = $1 WHERE id = $2`, [body.provider, userId]);
    }
  }
  if (body.image_provider !== undefined) {
    if (!(IMAGE_PROVIDERS as string[]).includes(body.image_provider)) return NextResponse.json({ error: 'Unknown image provider' }, { status: 400 });
    const row = await loadAiRow(userId);
    // Models belong to a provider: switching clears the model unless the request sets one.
    const changed = row && imageProviderFor(row) !== (body.image_provider as ImageProvider);
    await query(`UPDATE users SET image_provider = $1${changed ? ', image_model = NULL' : ''} WHERE id = $2`, [body.image_provider, userId]);
  }
  if (body.image_model !== undefined) {
    await query(`UPDATE users SET image_model = $1 WHERE id = $2`, [body.image_model ? String(body.image_model).trim().slice(0, 200) : null, userId]);
  }
  const clean = (m?: string | null) => (m ? String(m).trim().slice(0, 200) || null : null);
  if (body.model !== undefined) await query(`UPDATE users SET ai_model = $1 WHERE id = $2`, [clean(body.model), userId]);
  if (body.light_model !== undefined) await query(`UPDATE users SET ai_model_light = $1 WHERE id = $2`, [clean(body.light_model), userId]);

  return GET(req);
}
