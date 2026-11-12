/**
 * The context cloud file: one JSON document (.cloud.json) that holds a whole cloud, so it can be
 * saved, backed up, versioned, shared and opened again in Studio or published to ConteXtube.
 *
 * {
 *   "format": "context-cloud", "version": 1, "exported_at": "<ISO date>", "generator": "<app>",
 *   "cloud": { "title", "description"?, "genre"?, "language"?, "creator_name"?, "rights"?,
 *              "source_title"?, "source_author"?, "purchase_url"?, "slug"?, "url"?, "cover"?,
 *              "illustration_style"? },
 *   "elements": [ { "kind": plot|characters|stage|universe|ideas|references, "title", "text",
 *                   "image"?: { "url", "alt"?, "credit"? }, "metadata"?: { ... } } ]
 * }
 * Elements are in reading order within each kind. Plot metadata carries act, act_number,
 * beat_number and when; any element may carry source_quote, aliases and tags; references carry
 * origin (text|association), link and refType. Unknown keys are kept, so a newer file still opens.
 */
export const CLOUD_FILE_FORMAT = 'context-cloud';
export const CLOUD_FILE_VERSION = 1;
export const CLOUD_FILE_MIME = 'application/vnd.context-cloud+json';

export const CLOUD_KINDS = ['plot', 'characters', 'stage', 'universe', 'ideas', 'references'] as const;
export type CloudKind = (typeof CLOUD_KINDS)[number];

/** Studio's own names for the six clouds, and the kinds they are saved as. */
export const TYPE_TO_KIND: Record<string, CloudKind> = { arc: 'plot', characters: 'characters', scenes: 'stage', world: 'universe', ideas: 'ideas', references: 'references' };
export const KIND_TO_TYPE: Record<CloudKind, string> = { plot: 'arc', characters: 'characters', stage: 'scenes', universe: 'world', ideas: 'ideas', references: 'references' };
export const TYPE_ORDER = ['arc', 'characters', 'scenes', 'world', 'ideas', 'references'];

export type CloudFileImage = { url: string; alt?: string; credit?: string; source?: string };
export type CloudFileElement = { kind: CloudKind; title: string; text: string; image?: CloudFileImage; metadata?: Record<string, unknown> };
export type CloudFile = {
  format: typeof CLOUD_FILE_FORMAT;
  version: number;
  exported_at: string;
  generator: string;
  cloud: {
    title: string; description?: string; genre?: string; language?: string; creator_name?: string; rights?: string;
    source_title?: string; source_author?: string; purchase_url?: string; slug?: string; url?: string;
    cover?: CloudFileImage; illustration_style?: string;
  };
  elements: CloudFileElement[];
};

export function cloudFileName(title: string): string {
  const stem = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${stem || 'cloud'}.cloud.json`;
}

function imageOf(v: unknown): CloudFileImage | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const i = v as Record<string, unknown>;
  if (typeof i.url !== 'string' || !/^https:\/\//.test(i.url) || i.url.length > 2000) return undefined;
  return {
    url: i.url,
    ...(typeof i.alt === 'string' ? { alt: i.alt.slice(0, 300) } : {}),
    ...(typeof i.credit === 'string' ? { credit: i.credit.slice(0, 300) } : {}),
    ...(typeof i.source === 'string' ? { source: i.source.slice(0, 300) } : {}),
  };
}

const MAX_ELEMENTS = 1000;

/** Checks a parsed file and returns it cleaned, or a message saying what is wrong with it. */
export function parseCloudFile(input: unknown): { file: CloudFile } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'This is not a cloud file: it should be a JSON object.' };
  const f = input as Record<string, unknown>;
  if (f.format !== CLOUD_FILE_FORMAT) return { error: 'This is not a cloud file: "format" should be "context-cloud".' };
  if (typeof f.version !== 'number' || f.version < 1) return { error: 'The cloud file has no version number.' };
  if (Math.floor(f.version) > CLOUD_FILE_VERSION) return { error: `This cloud file is version ${f.version}; this Studio opens version ${CLOUD_FILE_VERSION}.` };
  const c = (f.cloud ?? {}) as Record<string, unknown>;
  if (typeof c.title !== 'string' || !c.title.trim()) return { error: 'The cloud file has no title ("cloud.title").' };
  if (!Array.isArray(f.elements) || !f.elements.length) return { error: 'The cloud file has no elements.' };
  if (f.elements.length > MAX_ELEMENTS) return { error: `The cloud file has more than ${MAX_ELEMENTS} elements.` };

  const elements: CloudFileElement[] = [];
  for (const [n, raw] of (f.elements as unknown[]).entries()) {
    const e = (raw ?? {}) as Record<string, unknown>;
    if (!CLOUD_KINDS.includes(e.kind as CloudKind)) return { error: `Element ${n + 1} has an unknown kind "${String(e.kind)}". Kinds are: ${CLOUD_KINDS.join(', ')}.` };
    if (typeof e.title !== 'string' || !e.title.trim()) return { error: `Element ${n + 1} has no title.` };
    const metadata = e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata) ? (e.metadata as Record<string, unknown>) : {};
    if (JSON.stringify(metadata).length > 20_000) return { error: `Element ${n + 1} ("${e.title}") carries too much metadata.` };
    const image = imageOf(e.image);
    elements.push({ kind: e.kind as CloudKind, title: e.title.trim().slice(0, 200), text: typeof e.text === 'string' ? e.text.slice(0, 20_000) : '', ...(image ? { image } : {}), metadata });
  }
  const str = (k: string, max: number) => (typeof c[k] === 'string' && (c[k] as string).trim() ? { [k]: (c[k] as string).trim().slice(0, max) } : {});
  const cover = imageOf(c.cover);
  return {
    file: {
      format: CLOUD_FILE_FORMAT,
      version: f.version,
      exported_at: typeof f.exported_at === 'string' ? f.exported_at : new Date().toISOString(),
      generator: typeof f.generator === 'string' ? f.generator.slice(0, 100) : 'unknown',
      cloud: {
        title: c.title.trim().slice(0, 200),
        ...str('description', 2000), ...str('genre', 60), ...str('language', 20), ...str('creator_name', 200), ...str('rights', 20),
        ...str('source_title', 300), ...str('source_author', 200), ...str('purchase_url', 500), ...str('slug', 80), ...str('url', 500),
        ...str('illustration_style', 2000),
        ...(cover ? { cover } : {}),
      },
      elements,
    },
  };
}
