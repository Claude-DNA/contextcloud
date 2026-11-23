import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { aiErrorResponse, getAiConfig, noKeyResponse } from '@/lib/ai-key';
import { generateJson } from '@/lib/ai';
import { GENERATOR_SYSTEM, IDENTITY_SCHEMA, INTERVIEW_SCHEMA, toIdentityFile } from '@/lib/engine/prompts';
import { readIdentity } from '@/lib/engine';

export const maxDuration = 120;

const MAX_QUESTIONS = 7;

/**
 * The Character Generator.
 * POST { mode: 'generate', description }            → { character }
 * POST { mode: 'interview', description, answers }  → { question, options } or { character }
 * POST { mode: 'extract', name, text }               → { character }
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const ai = await getAiConfig(userId);
  if (!ai) return noKeyResponse();
  const body = (await req.json().catch(() => ({}))) as { mode?: string; description?: string; name?: string; text?: string; answers?: { question: string; answer: string }[] };
  const description = String(body.description ?? '').slice(0, 4000);
  const answers = (Array.isArray(body.answers) ? body.answers : []).slice(0, MAX_QUESTIONS).map((a) => ({ question: String(a.question ?? '').slice(0, 500), answer: String(a.answer ?? '').slice(0, 1500) }));

  try {
    if (body.mode === 'interview') {
      const last = answers.length >= MAX_QUESTIONS;
      const raw = await generateJson<{ done?: boolean; question?: string; options?: string[]; character?: unknown }>({
        ai,
        system: `${GENERATOR_SYSTEM}

INTERVIEW
You build the character by asking the writer one question at a time. Each question should settle something that changes how the character behaves under pressure: which drive wins when two collide, what they fear more, how they treat a wrong done to them, how predictable they are. Offer 2-4 short answer options, but the writer may answer freely. When you know enough (or after ${MAX_QUESTIONS} answers), set "done" to true and return "character".`,
        prompt: `The writer's idea: ${description || '(none yet)'}

${answers.length ? `So far:\n${answers.map((a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`).join('\n')}` : 'No questions asked yet.'}

${last ? 'That is enough: return the finished character now ("done": true).' : 'Ask the next question, or finish if you know enough.'}`,
        schema: INTERVIEW_SCHEMA,
        temperature: 0.6,
        maxTokens: 6000,
      });
      if (raw.done || last) {
        if (!raw.character) return NextResponse.json({ error: 'The interview ended without a character. Try once more.' }, { status: 502 });
        return NextResponse.json({ character: readIdentity(toIdentityFile(raw.character)) });
      }
      return NextResponse.json({ question: String(raw.question ?? '').slice(0, 500), options: (raw.options ?? []).slice(0, 4).map((o) => String(o).slice(0, 200)) });
    }

    const prompt = body.mode === 'extract'
      ? `Reconstruct the character "${String(body.name ?? '').slice(0, 120)}" from this text, as they are at its start. Use only what the text shows or clearly implies.
<<<
${String(body.text ?? '').slice(0, 20000)}
>>>`
      : `The writer's idea: ${description}`;
    if (body.mode === 'extract' ? !String(body.text ?? '').trim() : !description.trim()) {
      return NextResponse.json({ error: body.mode === 'extract' ? 'Paste the text first.' : 'Describe the character first.' }, { status: 400 });
    }
    const raw = await generateJson({ ai, system: GENERATOR_SYSTEM, prompt, schema: IDENTITY_SCHEMA, temperature: body.mode === 'extract' ? 0.3 : 0.7, maxTokens: 6000 });
    return NextResponse.json({ character: readIdentity(toIdentityFile(raw)) });
  } catch (e) {
    return aiErrorResponse(e, 'The Character Generator failed');
  }
}
