import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { generate, type AiConfig } from '@/lib/ai';
import { getAiConfig, loadAiRow, providerFor, keyFor, noKeyResponse, aiErrorResponse } from '@/lib/ai-key';

export const maxDuration = 300;

/**
 * POST /api/v1/ask { prompt, system?, model?, json?, max_tokens?, temperature? }
 * One answer from your own text model, with your own key: for evaluations and scripts that need
 * the same model Studio uses. "model" overrides the one chosen in Settings (and is required when
 * none is chosen). → { text, model, provider }
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  await isDbAvailable();
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; system?: string; model?: string; json?: boolean; max_tokens?: number; temperature?: number };
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) return NextResponse.json({ error: '"prompt" is required.' }, { status: 400 });
  if (body.prompt.length > 600_000) return NextResponse.json({ error: 'The prompt is longer than 600,000 characters.' }, { status: 400 });
  const model = typeof body.model === 'string' && /^[\w.:\/-]{1,100}$/.test(body.model) ? body.model : undefined;

  let ai: AiConfig | null = await getAiConfig(userId);
  if (!ai && model) {
    const row = await loadAiRow(userId);
    const provider = row ? providerFor(row) : null;
    const apiKey = row && provider ? keyFor(row, provider) : null;
    if (provider && apiKey) ai = { provider, apiKey, model };
  }
  if (!ai) return noKeyResponse();

  try {
    const text = await generate({
      ai,
      prompt: body.prompt,
      system: typeof body.system === 'string' ? body.system.slice(0, 20_000) : undefined,
      model,
      json: body.json === true,
      maxTokens: Math.min(16_000, Math.max(16, Number(body.max_tokens) || 2000)),
      ...(typeof body.temperature === 'number' ? { temperature: Math.min(2, Math.max(0, body.temperature)) } : {}),
    });
    return NextResponse.json({ text, model: model ?? ai.model, provider: ai.provider });
  } catch (e) {
    return aiErrorResponse(e, 'The model did not answer');
  }
}
