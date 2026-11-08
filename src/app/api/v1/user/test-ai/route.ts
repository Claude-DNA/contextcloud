import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { generateJson } from '@/lib/ai';
import { getAiConfig, noKeyResponse } from '@/lib/ai-key';

/** POST → { ok, provider, model, light_model } after one tiny structured call to each model. */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  await isDbAvailable();
  const ai = await getAiConfig(userId);
  if (!ai) return noKeyResponse();

  const check = async (light: boolean) => {
    const out = await generateJson<{ ok?: boolean }>({
      ai,
      light,
      prompt: 'Reply with {"ok": true}.',
      schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] },
      maxTokens: 64,
      temperature: 0,
    });
    if (out?.ok !== true) throw new Error('The model answered, but not in the expected format.');
  };
  try {
    await check(false);
    if (ai.lightModel && ai.lightModel !== ai.model) await check(true);
    return NextResponse.json({ ok: true, provider: ai.provider, model: ai.model, light_model: ai.lightModel });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
