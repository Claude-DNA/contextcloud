import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { isDbAvailable } from '@/lib/db';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Normalize Gemini's sometimes-wrong cloud_type names
const TYPE_ALIASES: Record<string, string> = {
  stage: 'scenes', location: 'scenes', setting: 'scenes',
  themes: 'ideas', theme: 'ideas', concept: 'ideas',
  arcs: 'arc', beats: 'arc', beat: 'arc', plot: 'arc', chapter: 'arc',
  reference: 'references', source: 'references',
  character: 'characters',
  worlds: 'world', universe: 'world', rule: 'world',
};

const VALID_TYPES = ['characters', 'references', 'scenes', 'world', 'ideas', 'arc'];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  await isDbAvailable(); // wake Neon if needed
  const apiKey = await getGeminiKey(session.user.id, session.user.email);
  if (!apiKey) return noKeyResponse();

  const body = await req.json();
  const { text } = body as { text: string };

  if (!text?.trim() || text.trim().length < 10) {
    return NextResponse.json({ error: 'Text too short (minimum 10 characters)' }, { status: 400 });
  }

  const prompt = `You are a story analyst. Read the text below and extract its content into the 6-layer Context Cloud format.

Return ONLY valid JSON (no markdown, no code fences) — a JSON array of objects:
[
  { "cloud_type": "characters", "title": "Character Name", "content": "Physical description, personality, role, motivations...", "tags": ["protagonist", "complex"] }
]

CLOUD TYPES (use EXACTLY these values):
- "characters" — every named character, with their core contradiction
- "scenes" — every distinct location/setting, with sensory details (light, sound, texture)
- "world" — every rule about how this universe works
- "references" — every named reference (book, film, song, artwork, real event)
- "ideas" — every theme, tension, or abstract idea
- "arc" — every act, chapter, beat, or plot point (one beat per entry)

CRITICAL RULES:
- Extract EVERYTHING. No item limit — if the source has 80 extractable items, output 80.
- Every item must be specific — preserve actual language from the source, don't abstract.
- Do NOT summarize multiple things into one item. Keep them separate.
- Characters: name + their core contradiction (not just their role).
- Scenes: name + at least one sensory detail.
- World: the actual rule or fact, not a description of the description.
- Arc: one beat per entry. Title = brief label. Content = the FULL scene description from the source — preserve original language, details, emotional register, subtext. Never summarize to one sentence.
- When in doubt, include it. The user can delete; they can't add what you didn't extract.
- Tags should be 1-3 relevant keywords per item.
- content fields must NEVER be empty strings.

Text:
${text.slice(0, 30000)}`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI service error: ${res.status}`, details: err }, { status: 502 });
    }

    const data = await res.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Extraction returned invalid format' }, { status: 500 });
    }

    const items = (parsed as Array<{ cloud_type: string; title: string }>)
      .map(item => ({
        ...item,
        cloud_type: TYPE_ALIASES[item.cloud_type] ?? item.cloud_type,
      }))
      .filter(item => VALID_TYPES.includes(item.cloud_type) && item.title?.trim());

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
