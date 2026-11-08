import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { generate, GEMINI_MODEL_LITE } from '@/lib/gemini';

interface ArcWeightsBody {
  events: Array<{ id: string; text: string }>;
  description?: string;
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = (await req.json()) as ArcWeightsBody;
  const { events, description } = body;

  if (!events || events.length === 0) {
    return NextResponse.json({ error: 'No events provided' }, { status: 400 });
  }

  const apiKey = await getGeminiKey(userId);
  if (!apiKey) return noKeyResponse();

  const eventList = events.map(e => `- ${e.id}: "${e.text}"`).join('\n');
  const prompt = `You are analyzing a narrative arc for a story.${description ? ` Arc description: "${description}".` : ''} Given these narrative events, assign importance weights (integers, must sum to 100). Consider: climactic moments get higher weights, setup/transitions get lower weights. Return ONLY valid JSON: { "weights": { "<eventId>": <number> } }. Events:\n${eventList}`;

  try {
    let text: string;
    try {
      text = await generate({ apiKey, prompt, model: GEMINI_MODEL_LITE, temperature: 0.3, maxOutputTokens: 512, json: true });
    } catch (e) {
      return NextResponse.json({ error: `Gemini API error: ${e instanceof Error ? e.message : e}` }, { status: 502 });
    }
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({ weights: parsed.weights || parsed });
  } catch (err) {
    return NextResponse.json({ error: `Failed to analyze arc weights: ${err}` }, { status: 500 });
  }
}
