import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { isDbAvailable } from '@/lib/db';
import { generate } from '@/lib/gemini';


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
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  await isDbAvailable(); // wake Neon if needed
  const apiKey = await getGeminiKey(userId);
  if (!apiKey) return noKeyResponse();

  const body = await req.json();
  const { text } = body as { text: string };

  if (!text?.trim() || text.trim().length < 10) {
    return NextResponse.json({ error: 'Text too short (minimum 10 characters)' }, { status: 400 });
  }

  const prompt = `You are Context Cloud Architect — the lossless extraction engine for contextcloud.studio.
Mission: retain 100% of the information from the source text. Map every fact into the six layers. Never omit, merge, summarize, or invent.

━━━ STEP 0 — ATOMIC INVENTORY (internal reasoning only, do not output) ━━━
Before mapping, enumerate every unique fact as atomic items in your thinking:
• One item = one fact, detail, action, rule, or relationship.
• If the text has 100 details, you must account for all 100.
• Every paragraph or bullet from the source must produce at least one inventory item.
• Preserve original wording whenever possible.

━━━ STEP 1 — LAYER MAPPING ━━━
Map each inventory item to exactly one cloud_type (use these exact strings):
  "characters"  — identity, psychology, contradictions, relationships, arcs
  "scenes"      — locations and settings with sensory anchors
  "world"       — rules, history, systems, facts about how this universe works
  "references"  — named influences, books, films, artworks, real events
  "ideas"       — themes, philosophical tensions, abstract concepts
  "arc"         — plot beats (grouped by act — see Arc rule below)

━━━ CONTENT RULES (non-negotiable) ━━━
• content must NEVER be empty or a single sentence. Minimum 3 sentences per item.
• Characters: appearance (if known) + core contradiction + key relationships + what they want vs fear. Use original language from the source.
• Scenes — Sensory Anchor Rule: ALWAYS include Light, Sound, and Smell. If the source does not specify one, write exactly: [Light: not specified] / [Sound: not specified] / [Smell: not specified]. Never invent sensory details.
• World: state the actual rule or fact + its implications + how it shapes behavior or plot.
• Ideas: the tension or theme + how it manifests in specific characters or scenes + what it asks of the reader.
• References: what it is + why it appears here + its thematic connection to the story.
• Arc: GROUP all beats for the same act into ONE item. Title = "Act 1" or "Act 1: [title]". Content = ALL events for that act as flowing prose, preserving original language and emotional register. NEVER one item per bullet — one item per act only.
• Cross-references: if an item relates to another layer, note it in the content as [→ cross-ref: LayerName: Title].
• When in doubt, include it. The author can delete; they cannot add what you didn't extract.

━━━ OUTPUT ━━━
Return ONLY a valid JSON array — no markdown, no code fences:
[{ "cloud_type": "...", "title": "...", "content": "...", "tags": ["1-3 keywords"] }]

Text:
${text.slice(0, 30000)}`;

  try {
    let responseText: string;
    try {
      responseText = await generate({ apiKey, prompt, temperature: 0.7, maxOutputTokens: 8192, json: true });
    } catch (e) {
      return NextResponse.json({ error: 'AI service error', details: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }

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

    // Include provenance metadata for the batch save step
    const textHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.slice(0, 30000))))
    ).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

    return NextResponse.json({
      items,
      provenance: {
        source_type: 'ai_extraction',
        pipeline_steps: ['gemini_extract', 'type_normalize', 'validate'],
        source_text_hash: textHash,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
