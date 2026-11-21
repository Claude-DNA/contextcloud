import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { generateJson } from '@/lib/ai';
import { getAiConfig, noKeyResponse, aiErrorResponse } from '@/lib/ai-key';
import { MAKER_SCHEMA, MAKER_SYSTEM, makerPrompt, readMakerAnswer } from '@/lib/state-maker';

export const maxDuration = 120;

/**
 * POST /api/v1/states/generate { work, character, motivation? }
 * Proposes states of a character at moments of a story, in library shape. Nothing is saved.
 * → { known, work, character, note, options: [state] }
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  await isDbAvailable();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const work = s(body.work, 160);
  const character = s(body.character, 80);
  const motivation = s(body.motivation, 400);
  if (work.length < 2 || character.length < 2) return NextResponse.json({ error: 'Name the story and the character.' }, { status: 400 });

  const ai = await getAiConfig(userId);
  if (!ai) return noKeyResponse();
  try {
    const raw = await generateJson({ ai, system: MAKER_SYSTEM, prompt: makerPrompt(work, character, motivation), schema: MAKER_SCHEMA, temperature: 0.5, maxTokens: 12000 });
    return NextResponse.json(readMakerAnswer(raw, work, character));
  } catch (e) {
    return aiErrorResponse(e, 'The states could not be made');
  }
}
