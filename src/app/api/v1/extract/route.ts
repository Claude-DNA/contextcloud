import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { getAiConfig, noKeyResponse } from '@/lib/ai-key';
import { isDbAvailable } from '@/lib/db';
import { extractCloudItems } from '@/lib/extraction';


// Normalises cloud_type names a model sometimes gets wrong
const TYPE_ALIASES: Record<string, string> = {
  stage: 'scenes', location: 'scenes', setting: 'scenes',
  themes: 'ideas', theme: 'ideas', concept: 'ideas',
  arcs: 'arc', beats: 'arc', beat: 'arc', plot: 'arc', chapter: 'arc',
  reference: 'references', source: 'references',
  character: 'characters',
  worlds: 'world', universe: 'world', rule: 'world',
};

/** Quick Capture takes the author's notes, not finished prose. */
const QUICK_CAPTURE = `NOTES: this is the author's own material: notes, fragments or a pasted passage. Treat every statement as the author's decision about the story and file it in the right cloud, even when it describes something not yet written. Keep their wording. A one-line note becomes a one-sentence item; do not expand it or add anything they did not write.`;

const VALID_TYPES = ['characters', 'references', 'scenes', 'world', 'ideas', 'arc'];

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  await isDbAvailable(); // wake Neon if needed
  const ai = await getAiConfig(userId);
  if (!ai) return noKeyResponse();

  const body = await req.json();
  const { text } = body as { text: string };

  if (!text?.trim() || text.trim().length < 10) {
    return NextResponse.json({ error: 'Text too short (minimum 10 characters)' }, { status: 400 });
  }

  try {
    // Same engine as file uploads; a snippet is usually one part. Beats stay separate (no act grouping).
    const { items: merged, coverage } = await extractCloudItems(
      { kind: 'text', text },
      { ai, temperature: 0.4, groupActs: false, blocks: QUICK_CAPTURE }
    );
    if (coverage.parts_extracted === 0) {
      return NextResponse.json({ error: 'AI service error', details: 'The extraction request failed. Try again.' }, { status: 502 });
    }

    const items = merged.map((m) => ({
      cloud_type: m.cloud_type,
      title: m.title,
      content: m.content,
      tags: m.tags,
      metadata: {
        source_quote: m.source_quotes[0] ?? '',
        source_quotes: m.source_quotes,
        aliases: m.aliases,
        ...(m.initial_state ? { initial_state: m.initial_state } : {}),
        ...(m.cloud_type === 'arc' ? { when: m.when ?? 'main' } : {}),
      },
    }));

    // Provenance for the batch save step
    const textHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
    ).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

    return NextResponse.json({
      items,
      coverage,
      provenance: {
        source_type: 'ai_extraction',
        pipeline_steps: ['gemini_extract_parts', 'merge_entities', 'validate'],
        source_text_hash: textHash,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
