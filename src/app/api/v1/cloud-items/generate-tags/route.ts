import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';

const CLOUD_TAG_CONTEXT: Record<string, string> = {
  characters: 'a character in a story',
  references: 'a creative reference (book, film, music, art, etc.)',
  scenes: 'a physical location or set (room, landscape, planet, ship interior)',
  world: 'a universe-building element (system, technology, historical force, cosmic fact)',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not configured' }, { status: 500 });
  }

  const { cloudType, title, content } = await req.json();
  const context = CLOUD_TAG_CONTEXT[cloudType] || 'a creative element';

  const prompt = `You are helping tag ${context} in a creative writing project.

Title: "${title}"
${content ? `Description: "${content}"` : ''}

Generate 4–7 short, specific tags that describe this element. Tags should be single words or short phrases (2–3 words max). Focus on qualities, nature, or notable attributes — not generic categories.

Return ONLY a JSON array of lowercase strings. Example format: ["dark", "vast", "inhabited", "post-war"]`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 256 },
        }),
      }
    );

    if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const tags: string[] = JSON.parse(cleaned);
    return NextResponse.json({ tags: Array.isArray(tags) ? tags : [] });
  } catch (err) {
    return NextResponse.json({ error: `Tag generation failed: ${err}` }, { status: 500 });
  }
}
