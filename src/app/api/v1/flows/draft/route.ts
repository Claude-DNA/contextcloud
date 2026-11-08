import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { generateJson } from '@/lib/gemini';
import { normaliseForQuote, type FlowChunk } from '@/lib/flow';

export const maxDuration = 120;

/** Structured output: the shape Gemini must return. */
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    description: { type: 'STRING' },
    chunks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          layer: { type: 'INTEGER' },
          type: { type: 'STRING', enum: ['idea', 'meta'] },
          extract: { type: 'STRING' },
          text: { type: 'STRING' },
          source_quote: { type: 'STRING' },
          links: { type: 'ARRAY', items: { type: 'STRING' } },
          importance: { type: 'NUMBER' },
        },
        required: ['layer', 'text'],
      },
    },
  },
  required: ['chunks'],
};

const LABEL: Record<string, string> = {
  characters: 'CHARACTER', scenes: 'STAGE', world: 'WORLD', ideas: 'IDEA', references: 'REFERENCE', arc: 'BEAT',
};

const RIGHTS: Record<string, string> = {
  own: "the author's own work",
  public_domain: 'in the public domain',
  copyrighted: 'under copyright: keep quotes short',
};

/** A first line that looks like a title (short, no closing full stop) names the work when the author hasn't. */
function titleFromSource(text: string): string | undefined {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean);
  if (!first || first.length > 120 || /[.!?…:;,]$/.test(first)) return undefined;
  return first;
}

/**
 * POST { project_id?: string | null, work?: { title?, author?, rights? } }
 *   → { title, source_title, source_author, description, chunks, has_source, unverified }
 * Drafts a ConteXtube flow (L1–L5) from a project's clouds. Nothing is saved; the editor shows the draft.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const apiKey = await getGeminiKey(userId);
  if (!apiKey) return noKeyResponse();

  const { project_id, work = {} } = (await req.json().catch(() => ({}))) as {
    project_id?: string | null;
    work?: { title?: string; author?: string; rights?: string };
  };
  const scope = project_id ? 'project_id = $2' : 'project_id IS NULL';
  const params = project_id ? [userId, project_id] : [userId];

  const [itemsRes, sourcesRes, projectRes] = await Promise.all([
    query(
      `SELECT cloud_type, title, content, metadata FROM cloud_items WHERE user_id = $1 AND ${scope}
       ORDER BY cloud_type, sort_order, created_at LIMIT 300`,
      params
    ),
    query(`SELECT filename, text FROM project_sources WHERE user_id = $1 AND ${scope} ORDER BY created_at`, params),
    project_id ? query('SELECT title FROM projects WHERE id = $1 AND user_id = $2', [project_id, userId]) : Promise.resolve({ rows: [] }),
  ]);
  const projectTitle = (projectRes.rows[0] as { title?: string } | undefined)?.title;

  const items = itemsRes.rows as { cloud_type: string; title: string; content: string; metadata: Record<string, unknown> | null }[];
  if (items.length === 0) {
    return NextResponse.json({ error: 'This project has no cloud items yet. Upload a text or add items first.' }, { status: 400 });
  }
  const sources = sourcesRes.rows as { filename: string; text: string }[];
  const sourceText = sources.map((s) => s.text).join('\n\n');

  // The work being read: what the author typed, else the source's title line and, for their own work, their name.
  const rights = work.rights && RIGHTS[work.rights] ? work.rights : 'own';
  const workTitle = work.title?.trim() || (sources[0] ? titleFromSource(sources[0].text) : undefined) || projectTitle || 'Untitled';
  let workAuthor = work.author?.trim() || '';
  if (!workAuthor && rights === 'own') {
    const u = await query('SELECT name FROM users WHERE id = $1', [userId]);
    workAuthor = ((u.rows[0] as { name?: string } | undefined)?.name ?? '').trim();
  }

  const itemQuotes = items
    .map((i) => (typeof i.metadata?.source_quote === 'string' ? (i.metadata.source_quote as string) : ''))
    .filter(Boolean);

  const itemBlock = items
    .map((i) => {
      const quote = typeof i.metadata?.source_quote === 'string' && i.metadata.source_quote ? `\n  quote: "${i.metadata.source_quote}"` : '';
      const where = [i.metadata?.act, i.metadata?.when && i.metadata.when !== 'main' ? String(i.metadata.when).replace('_', '-') : '']
        .filter((x) => typeof x === 'string' && x)
        .join('; ');
      return `[${LABEL[i.cloud_type] ?? i.cloud_type}] ${i.title}${where ? ` (${where})` : ''}\n  ${i.content.slice(0, 1200).replace(/\n+/g, ' ')}${quote}`;
    })
    .join('\n');

  const prompt = `FLOW_DRAFT
You are drafting a ConteXtube flow: one person's reading of a work, in five layers, for AI agents and human readers.
Write in English. Draft for the author to edit; keep their material's voice and register.

LAYERS
L1 Abstract Associations (2-4 chunks, ~50 tokens each). "extract": 2-8 words in symbolic notation using → (leads to), ↔ (tension), = (equivalence), ∅ (absence), ∞ (deep bond), ∴ (therefore), ⊂ (within), "." (qualifies the word before it), e.g. "faithfulness∅audience". "text": one or two sentences of what the work feels like. importance 0.7-1.0; the single most essential chunk gets the highest.
L2 Ideas & Evidence (3-8 chunks, ~200 tokens each). Each is one idea, with "source_quote" copied EXACTLY, word for word, from the SOURCE TEXT or the item quotes below. Never paraphrase or invent a quote. If no real quote supports an idea, leave source_quote empty.
L3 Connections (2-5 chunks). How the work connects to other works, thinkers or domains. Put the names of the other works in "links".
L4 Synthesis (1-2 chunks, up to ~500 tokens in total). The interpretation: what the work means and why it matters. An argued view, not a summary.
L5 one chunk with "type": "meta": a short note on how this reading was drafted (from which kinds of cloud items), written so the author can finish it.
Use "type": "idea" for every chunk except that L5 note. Also return a one-sentence "description" of the work.

WORK: ${workTitle}${workAuthor ? ` by ${workAuthor}` : ''}, ${RIGHTS[rights]}.

CLOUD ITEMS
${itemBlock}

${sourceText ? `SOURCE TEXT\n${sourceText.slice(0, 60000)}` : 'SOURCE TEXT\n(not stored; take quotes only from the item quotes above)'}

Now return the JSON object: "description" (one sentence), and "chunks" for L1 to L5 as described at the top. Every L2 source_quote must be copied exactly from the text above, or left empty.`;

  let draft: { description?: string; chunks?: Partial<FlowChunk>[] };
  try {
    draft = await generateJson({ apiKey, prompt, schema: SCHEMA, temperature: 0.5, maxOutputTokens: 8192 });
  } catch (e) {
    return NextResponse.json({ error: 'Drafting failed', details: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  // Check every quote against what the author actually supplied.
  const corpus = normaliseForQuote([sourceText, ...itemQuotes, ...items.map((i) => i.content)].join('\n'));
  let unverified = 0;
  const chunks: FlowChunk[] = (draft.chunks ?? [])
    .filter((c) => typeof c.text === 'string' && c.text.trim() && c.layer && c.layer >= 1 && c.layer <= 5)
    .map((c) => {
      const quote = (c.source_quote ?? '').trim().replace(/^["“]|["”]$/g, '');
      const found = !quote || corpus.includes(normaliseForQuote(quote));
      if (!found) unverified++;
      const layer = c.layer as FlowChunk['layer'];
      return {
        id: crypto.randomUUID(),
        layer,
        type: layer === 5 ? 'meta' : 'idea',
        extract: c.extract?.trim() || undefined,
        text: c.text!.trim(),
        source_quote: quote || undefined,
        links: Array.isArray(c.links) && c.links.length ? c.links.map(String) : undefined,
        importance: typeof c.importance === 'number' ? Math.max(0, Math.min(1, c.importance)) : undefined,
        quote_unverified: !found || undefined,
      };
    });

  return NextResponse.json({
    title: workTitle,
    source_title: workTitle,
    source_author: workAuthor || undefined,
    description: draft.description ?? '',
    chunks,
    has_source: sources.length > 0,
    unverified,
  });
}

/** GET ?project_id= → { items, has_source }: what a project holds, for the editor's "Draft from project" controls. */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const projectId = req.nextUrl.searchParams.get('project_id');
  const scope = projectId ? 'project_id = $2' : 'project_id IS NULL';
  const params = projectId ? [userId, projectId] : [userId];
  const [items, sources] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM cloud_items WHERE user_id = $1 AND ${scope}`, params),
    query(`SELECT COUNT(*)::int AS n FROM project_sources WHERE user_id = $1 AND ${scope}`, params),
  ]);
  return NextResponse.json({ items: items.rows[0].n, has_source: sources.rows[0].n > 0 });
}
