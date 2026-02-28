import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';

interface ArcWeightsBody {
  events: Array<{ id: string; text: string }>;
  description?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = (await req.json()) as ArcWeightsBody;
  const { events, description } = body;

  if (!events || events.length === 0) {
    return NextResponse.json({ error: 'No events provided' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not configured' }, { status: 500 });
  }

  const eventList = events.map(e => `- ${e.id}: "${e.text}"`).join('\n');
  const prompt = `You are analyzing a narrative arc for a story.${description ? ` Arc description: "${description}".` : ''} Given these narrative events, assign importance weights (integers, must sum to 100). Consider: climactic moments get higher weights, setup/transitions get lower weights. Return ONLY valid JSON: { "weights": { "<eventId>": <number> } }. Events:\n${eventList}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Gemini API error: ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({ weights: parsed.weights || parsed });
  } catch (err) {
    return NextResponse.json({ error: `Failed to analyze arc weights: ${err}` }, { status: 500 });
  }
}
