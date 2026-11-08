import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { IMAGE_PROVIDERS, IMAGE_DEFAULTS, listImageModels, type ImageProvider } from '@/lib/ai/images';
import { loadAiRow, keyFor } from '@/lib/ai-key';

/** GET ?provider=google|openai|openrouter → { models: [{ id, name, price? }], recommended } — live, with the user's key. */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const provider = req.nextUrl.searchParams.get('provider') as ImageProvider | null;
  if (!provider || !IMAGE_PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Unknown image provider' }, { status: 400 });
  const row = await loadAiRow(userId);
  const key = row ? keyFor(row, provider) : null;
  if (!key && provider !== 'openrouter') return NextResponse.json({ error: 'Add a key for this provider first.', models: [] }, { status: 400 });
  try {
    const models = await listImageModels(provider, key ?? '');
    const ids = models.map((m) => m.id);
    const pref = IMAGE_DEFAULTS[provider];
    const recommended = pref && ids.includes(pref) ? pref : ids.find((id) => /flash.*image|image.*flash/.test(id)) ?? ids[0] ?? null;
    return NextResponse.json({ models, recommended });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load image models.', details: e instanceof Error ? e.message : String(e), models: [] }, { status: 502 });
  }
}
