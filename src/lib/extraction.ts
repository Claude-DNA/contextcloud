/**
 * Chapter-by-chapter extraction of cloud items from a long text.
 *
 *   1. split the text at chapter headings, packed into parts of about 20,000 characters
 *   2. extract each part separately, several at a time, keeping a verbatim quote and location per item
 *   3. merge the same entity across parts (same title or alias; "Elias" + "Elias Varga")
 *   4. group the story beats from every part into acts in one small final call
 *
 * The old pipeline sent one request with the text cut at 30,000 characters and an 8,000-token
 * answer, so most of a novel was silently dropped. Coverage is now reported to the user.
 */
import { generateJson, mapLimit, type GeminiPart } from '@/lib/gemini';

export const CLOUD_TYPES = ['characters', 'scenes', 'world', 'references', 'ideas', 'arc'] as const;
export type CloudType = (typeof CLOUD_TYPES)[number];

export interface RawItem {
  cloud_type: string;
  title: string;
  aliases?: string[];
  content: string;
  tags?: string[];
  source_quote?: string;
  location?: string;
}

export interface MergedItem {
  cloud_type: CloudType;
  title: string;
  content: string;
  tags: string[];
  aliases: string[];
  source_quotes: string[];
  locations: string[];
}

export interface Coverage {
  parts_total: number;
  parts_extracted: number;
  parts_failed: number;
  characters: number;
  truncated: boolean;
}

const PART_SIZE = 20_000;
const MAX_PARTS = 40; // ~800,000 characters: a long novel
const CONCURRENCY = 5;

const TYPE_ALIASES: Record<string, CloudType> = {
  stage: 'scenes', location: 'scenes', setting: 'scenes', scene: 'scenes',
  themes: 'ideas', theme: 'ideas', concept: 'ideas', idea: 'ideas',
  arcs: 'arc', beats: 'arc', beat: 'arc', plot: 'arc', chapter: 'arc',
  reference: 'references', source: 'references',
  character: 'characters',
  worlds: 'world', universe: 'world', rule: 'world',
};

function normaliseType(t: string): CloudType | null {
  const v = (t || '').trim().toLowerCase();
  if ((CLOUD_TYPES as readonly string[]).includes(v)) return v as CloudType;
  return TYPE_ALIASES[v] ?? null;
}

const HEADING = /^\s*(?:#{1,3}\s+\S.*|(?:chapter|part|book|act|prologue|epilogue|interlude)\b.{0,80}|[IVXLC]{1,7}\.?|\d{1,3}\.?)\s*$/i;

/** Splits at chapter-like headings, then packs sections into parts of about PART_SIZE characters. */
export function splitIntoParts(text: string, size = PART_SIZE): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (HEADING.test(line) && cur.join('\n').trim().length > 500) {
      sections.push(cur.join('\n'));
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length) sections.push(cur.join('\n'));

  // Sections longer than a part are split at paragraph breaks.
  const pieces: string[] = [];
  for (const s of sections) {
    if (s.length <= size) {
      pieces.push(s);
      continue;
    }
    let buf = '';
    for (const para of s.split(/\n\s*\n/)) {
      if (buf && buf.length + para.length + 2 > size) {
        pieces.push(buf);
        buf = para;
      } else {
        buf = buf ? `${buf}\n\n${para}` : para;
      }
    }
    if (buf) pieces.push(buf);
  }

  // Pack small pieces together.
  const parts: string[] = [];
  let pack = '';
  for (const piece of pieces) {
    if (pack && pack.length + piece.length + 2 > size) {
      parts.push(pack);
      pack = piece;
    } else {
      pack = pack ? `${pack}\n\n${piece}` : piece;
    }
  }
  if (pack.trim()) parts.push(pack);
  return parts.filter((p) => p.trim().length > 0);
}

const ITEM_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      cloud_type: { type: 'STRING', enum: [...CLOUD_TYPES] },
      title: { type: 'STRING' },
      aliases: { type: 'ARRAY', items: { type: 'STRING' } },
      content: { type: 'STRING' },
      tags: { type: 'ARRAY', items: { type: 'STRING' } },
      source_quote: { type: 'STRING' },
      location: { type: 'STRING' },
    },
    required: ['cloud_type', 'title', 'content'],
  },
};

export interface ExtractOptions {
  apiKey: string;
  /** Group story beats into acts (uploads). Quick Capture keeps beats separate. Default true. */
  groupActs?: boolean;
  /** Extra prompt blocks from the upload wizard: structure, temperature, character mode. */
  blocks?: string;
  temperature?: number;
}

function partPrompt(n: number, total: number, blocks: string, body: string | null): string {
  return `EXTRACT_CHUNK
You are Context Cloud Architect, the extraction engine for contextcloud.studio.
This is CHUNK ${n} OF ${total} of a longer text. Extract everything in THIS part; other parts are handled separately and merged later.
Map every fact, detail, action, rule and relationship to one of six cloud types. Never omit, merge across items, summarise away, or invent.

TYPES (use these exact strings)
  "characters"  identity, psychology, contradictions, relationships, what they want vs fear
  "scenes"      locations with sensory anchors. Always include Light, Sound and Smell; if the text does not say, write [Light: not specified] etc. Never invent sensory detail.
  "world"       rules, history, systems, facts about how this world works, and their consequences
  "references"  named influences: books, films, artworks, real people or events, and why they appear
  "ideas"       themes as specific tensions, how they live in particular characters or scenes
  "arc"         story beats in this part, ONE ITEM PER BEAT, in the order they happen (acts are grouped later)

RULES
- content: at least 3 sentences, in the source's own language and register where possible.
- title: the name used in the text. List other names for the same entity in "aliases" (nicknames, surnames, "the keeper").
- source_quote: a short passage (up to 300 characters) copied EXACTLY, word for word, from this part, that best supports the item. Empty only for items you were explicitly allowed to suggest.
- location: where in the part it appears, e.g. the chapter heading or "opening", "middle", "end".
- When in doubt, include it. The author can delete; they cannot add what you didn't extract.
${blocks}
Return a JSON array of items.
${body === null ? '' : `\nPART ${n} OF ${total}\n${body}`}`;
}

/** Extracts one part. Returns null when the call fails, so one bad part doesn't sink the upload. */
async function extractPart(opts: ExtractOptions, prompt: GeminiPart[]): Promise<RawItem[] | null> {
  try {
    const out = await generateJson<RawItem[]>({
      apiKey: opts.apiKey,
      prompt,
      schema: ITEM_SCHEMA,
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: 16_384,
    });
    return Array.isArray(out) ? out : [];
  } catch (e) {
    console.error('[extraction] part failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/^(the|a|an)\s+/, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/** Merges items that name the same entity: same type and a shared title or alias, or a first name that matches a full name. */
export function mergeItems(raw: RawItem[]): MergedItem[] {
  const merged: MergedItem[] = [];
  const index = new Map<string, MergedItem>(); // `${type}::${normalised name}`

  for (const r of raw) {
    const type = normaliseType(r.cloud_type);
    const title = (r.title || '').trim();
    if (!type || !title) continue;
    if (type === 'arc') {
      // Beats are kept in order and grouped into acts later; never merged by title.
      merged.push({ cloud_type: 'arc', title, content: r.content ?? '', tags: r.tags ?? [], aliases: [], source_quotes: r.source_quote ? [r.source_quote] : [], locations: r.location ? [r.location] : [] });
      continue;
    }
    const names = [title, ...(r.aliases ?? [])].map(norm).filter(Boolean);
    let target = names.map((n) => index.get(`${type}::${n}`)).find(Boolean);

    if (!target && type === 'characters') {
      // "Elias" and "Elias Varga" are the same person when one is the other's first name.
      const first = norm(title).split(' ');
      target = merged.find((m) => {
        if (m.cloud_type !== 'characters') return false;
        const other = norm(m.title).split(' ');
        return (first.length === 1 && other.length > 1 && other[0] === first[0]) || (other.length === 1 && first.length > 1 && first[0] === other[0]);
      });
    }

    if (!target) {
      target = { cloud_type: type, title, content: '', tags: [], aliases: [], source_quotes: [], locations: [] };
      merged.push(target);
    } else if (title.length > target.title.length && type === 'characters') {
      // Prefer the fuller name as the title; keep the shorter one as an alias.
      target.aliases.push(target.title);
      target.title = title;
    }

    const content = (r.content ?? '').trim();
    if (content && !target.content.includes(content)) {
      target.content = target.content ? `${target.content}\n\n${content}` : content;
    }
    for (const t of r.tags ?? []) if (!target.tags.includes(t) && target.tags.length < 6) target.tags.push(t);
    for (const a of [title, ...(r.aliases ?? [])]) if (a && a !== target.title && !target.aliases.includes(a)) target.aliases.push(a);
    if (r.source_quote && !target.source_quotes.includes(r.source_quote) && target.source_quotes.length < 5) target.source_quotes.push(r.source_quote);
    if (r.location && !target.locations.includes(r.location)) target.locations.push(r.location);
    for (const n of [target.title, ...target.aliases].map(norm)) index.set(`${type}::${n}`, target);
  }

  for (const m of merged) if (m.content.length > 6000) m.content = m.content.slice(0, 6000) + '…';
  return merged;
}

const ACTS_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { title: { type: 'STRING' }, beats: { type: 'ARRAY', items: { type: 'INTEGER' } } },
    required: ['title', 'beats'],
  },
};

/** Groups beats (in story order) into acts: one arc item per act, beats in order inside it. */
export async function groupBeatsIntoActs(opts: ExtractOptions, beats: MergedItem[], structureHint: string): Promise<MergedItem[]> {
  if (beats.length <= 1) return beats;
  let acts: { title: string; beats: number[] }[] | null = null;
  try {
    acts = await generateJson<{ title: string; beats: number[] }[]>({
      apiKey: opts.apiKey,
      prompt: `GROUP_ACTS
Group these story beats, listed in the order they happen, into acts. Every beat belongs to exactly one act, acts keep the beats' order, and act titles look like "Act 1: The Promise".
${structureHint}
BEATS
${beats.map((b, i) => `${i}. ${b.title}: ${b.content.slice(0, 200).replace(/\n+/g, ' ')}`).join('\n')}
Return a JSON array of { "title", "beats": [indexes] }.`,
      schema: ACTS_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 4096,
    });
  } catch (e) {
    console.error('[extraction] grouping acts failed:', e instanceof Error ? e.message : e);
  }

  const used = new Set<number>();
  const out: MergedItem[] = [];
  for (const act of Array.isArray(acts) ? acts : []) {
    const idx = (act.beats ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < beats.length && !used.has(i)).sort((a, b) => a - b);
    if (!idx.length) continue;
    idx.forEach((i) => used.add(i));
    out.push(actFrom(act.title || `Act ${out.length + 1}`, idx.map((i) => beats[i])));
  }
  const leftover = beats.filter((_, i) => !used.has(i));
  if (out.length === 0) return [actFrom('The story', beats)]; // grouping failed: keep every beat, in order
  if (leftover.length) out.push(actFrom(`Act ${out.length + 1}`, leftover));
  return out;
}

function actFrom(title: string, beats: MergedItem[]): MergedItem {
  return {
    cloud_type: 'arc',
    title,
    content: beats.map((b) => `${b.title}. ${b.content}`.trim()).join('\n\n'),
    tags: [],
    aliases: [],
    source_quotes: beats.flatMap((b) => b.source_quotes).slice(0, 5),
    locations: beats.flatMap((b) => b.locations),
  };
}

export type ExtractInput = { kind: 'text'; text: string } | { kind: 'binary'; mimeType: string; base64: string };

/** Runs the whole pipeline on an uploaded file's content. */
export async function extractCloudItems(
  input: ExtractInput,
  opts: ExtractOptions & { structureHint?: string }
): Promise<{ items: MergedItem[]; coverage: Coverage }> {
  const blocks = opts.blocks ?? '';
  let raws: (RawItem[] | null)[];
  let coverage: Coverage;

  if (input.kind === 'binary') {
    // PDFs go to Gemini whole; it reads the document natively. Long PDFs: DOCX or TXT give full coverage.
    const parts: GeminiPart[] = [{ text: partPrompt(1, 1, blocks, null) }, { inlineData: { mimeType: input.mimeType, data: input.base64 } }];
    raws = [await extractPart(opts, parts)];
    coverage = { parts_total: 1, parts_extracted: raws[0] ? 1 : 0, parts_failed: raws[0] ? 0 : 1, characters: 0, truncated: false };
  } else {
    const all = splitIntoParts(input.text);
    const parts = all.slice(0, MAX_PARTS);
    raws = await mapLimit(parts, CONCURRENCY, (body, i) => extractPart(opts, [{ text: partPrompt(i + 1, parts.length, blocks, body) }]));
    coverage = {
      parts_total: all.length,
      parts_extracted: raws.filter(Boolean).length,
      parts_failed: raws.filter((r) => r === null).length,
      characters: input.text.length,
      truncated: all.length > MAX_PARTS,
    };
  }

  const merged = mergeItems(raws.flatMap((r) => r ?? []));
  const beats = merged.filter((m) => m.cloud_type === 'arc');
  const rest = merged.filter((m) => m.cloud_type !== 'arc');
  const acts = opts.groupActs === false ? beats : await groupBeatsIntoActs(opts, beats, opts.structureHint ?? '');
  return { items: [...rest, ...acts], coverage };
}
