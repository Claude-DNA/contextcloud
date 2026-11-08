import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { PROVIDERS, listModels, recommendModels, type Provider } from '@/lib/ai';
import { loadAiRow, keyFor } from '@/lib/ai-key';

/**
 * GET ?provider=google|anthropic|openai|openrouter → { models: [{ id, name, inputPrice?, outputPrice?, context? }], recommended }
 * Lists the provider's current models live, with the user's saved key. OpenRouter's list is public.
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});

  const provider = req.nextUrl.searchParams.get('provider') as Provider | null;
  if (!provider || !PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  const row = await loadAiRow(userId);
  const key = row ? keyFor(row, provider) : null;
  if (!key && provider !== 'openrouter') {
    return NextResponse.json({ error: 'Add a key for this provider first.', models: [] }, { status: 400 });
  }
  try {
    const models = await listModels(provider, key ?? '');
    return NextResponse.json({ models, recommended: recommendModels(provider, models) });
  } catch (e) {
    const status = (e as { status?: number }).status;
    return NextResponse.json(
      { error: status === 401 || status === 403 ? 'The provider rejected this key.' : 'Could not load models.', details: e instanceof Error ? e.message : String(e), models: [] },
      { status: 502 }
    );
  }
}
