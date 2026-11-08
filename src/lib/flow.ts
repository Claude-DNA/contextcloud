/**
 * A flow: one reading of a work in ConteXtube's five layers. Shared by the editor (browser),
 * the AI drafting step and publishing (server). No Node-only imports here.
 *
 * Layer names and budgets follow the ConteXtube User Manual v1.0.
 */

export type Rights = 'own' | 'public_domain' | 'copyrighted';
export type ChunkType = 'idea' | 'narrative' | 'meta';

export interface FlowChunk {
  id: string;
  layer: 1 | 2 | 3 | 4 | 5;
  type: ChunkType;
  extract?: string;
  text: string;
  source_quote?: string;
  links?: string[];
  importance?: number;
  /** Set by the AI drafting step when a quote could not be found in the source; cleared when the author edits it. */
  quote_unverified?: boolean;
}

export interface FlowMeta {
  project_id?: string | null;
  source_title?: string;
  source_author?: string;
  rights?: Rights;
  purchase_url?: string;
  /** Publish the project's stored source text as L5 narrative (own or public-domain works only). */
  include_source?: boolean;
}

export const FLOW_LAYERS = [
  { n: 1, name: 'Abstract Associations', short: 'Pure Ideas', budget: 50, hint: 'The essence in a symbolic extract: what the work feels like before you think about it.' },
  { n: 2, name: 'Ideas & Evidence', short: 'Evidence', budget: 200, hint: 'Ideas, each backed by a quote copied exactly from the source.' },
  { n: 3, name: 'Connections', short: 'Connections', budget: 300, hint: 'Links to other works, ideas and domains.' },
  { n: 4, name: 'Synthesis', short: 'Synthesis', budget: 500, hint: 'Your interpretation: the "so what".' },
  { n: 5, name: 'Full Narrative & Meta', short: 'Narrative', budget: 1000, hint: 'The source text (your own work or public domain) and notes on how this reading was made.' },
] as const;

export const EXTRACT_SYMBOLS = ['→', '↔', '=', '∅', '∞', '∴', '⊂', '.'];

/** Rough token count (≈4 characters per token), for budget hints only. */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

/** Same rule as ConteXtube: words in an extract, not counting a quoted fragment or a [location] tag. */
export function extractWordCount(extract: string): number {
  const withoutQuotes = extract
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/«[^»]*»/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ');
  const words = withoutQuotes.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return extract.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
  return words.length;
}

export interface FlowProblem {
  chunkId?: string;
  message: string;
}

/** The checks ConteXtube applies on publish, so problems show up while editing. */
export function validateFlow(title: string, chunks: FlowChunk[], meta: FlowMeta): FlowProblem[] {
  const problems: FlowProblem[] = [];
  if (!title.trim()) problems.push({ message: 'Add a title.' });
  const filled = chunks.filter((c) => c.text.trim());
  if (filled.length === 0) problems.push({ message: 'Write at least one chunk.' });
  for (const c of filled) {
    if (c.extract && extractWordCount(c.extract) > 8) {
      problems.push({ chunkId: c.id, message: `L${c.layer}: the extract must be 8 words or fewer.` });
    }
    if (c.layer === 2 && !c.source_quote?.trim()) {
      problems.push({ chunkId: c.id, message: 'L2: every idea needs a quote from the source.' });
    }
    if (c.layer === 5 && c.type === 'narrative' && meta.rights === 'copyrighted') {
      problems.push({ chunkId: c.id, message: 'L5: source text of a copyrighted work cannot be published. Use notes and a purchase link.' });
    }
  }
  if (meta.rights === 'copyrighted' && meta.purchase_url && !/^https?:\/\//.test(meta.purchase_url)) {
    problems.push({ message: 'The purchase link must start with https://.' });
  }
  return problems;
}

/** Old drafts used five free-form layer types; this maps them onto ConteXtube's layers. */
const LEGACY_LAYER: Record<string, 1 | 3 | 4 | 5> = { core: 1, cultural: 3, bridge: 3, context: 4, reference: 5 };

export function isFlowChunks(layers: unknown): layers is FlowChunk[] {
  return Array.isArray(layers) && layers.every((l) => l && typeof l === 'object' && typeof (l as FlowChunk).layer === 'number');
}

export function toFlowChunks(layers: unknown, newId: () => string): FlowChunk[] {
  if (!Array.isArray(layers)) return [];
  if (isFlowChunks(layers)) return layers.map((c) => ({ ...c, id: c.id || newId(), type: c.type || 'idea' }));
  return (layers as { id?: string; type?: string; content?: string; name?: string }[])
    .filter((l) => typeof l?.content === 'string' && l.content.trim())
    .map((l) => {
      const layer = LEGACY_LAYER[l.type ?? ''] ?? 4;
      return { id: l.id || newId(), layer, type: layer === 5 ? 'meta' : 'idea', text: l.content!.trim() } as FlowChunk;
    });
}

/** Splits a long text into passages of about `size` characters at paragraph breaks (same as the ConteXtube seed). */
export function passages(text: string, size = 1800): string[] {
  const paras = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > size) {
      out.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Normalises text for "is this quote really in the source?" checks: case, quotes, dashes, spacing. */
export function normaliseForQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}
