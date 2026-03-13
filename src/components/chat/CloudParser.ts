/**
 * CloudParser — extracts structured cloud items from AI chat messages.
 *
 * Recognises the 6-layer Context Cloud format:
 *   CHARACTERS, STAGE, WORLD, REFERENCES, IDEAS, ARC
 *
 * Each bullet (•) under a layer heading becomes one CloudItem.
 */

export type CloudType = 'characters' | 'scenes' | 'world' | 'references' | 'ideas' | 'arc';

export interface ParsedCloudItem {
  cloud_type: CloudType;
  title: string;
  content: string;
  tags: string[];
}

/** Map from layer heading (uppercased) → cloud_type stored in DB */
const LAYER_MAP: Record<string, CloudType> = {
  CHARACTERS: 'characters',
  STAGE: 'scenes',
  WORLD: 'world',
  REFERENCES: 'references',
  IDEAS: 'ideas',
  ARC: 'arc',
};

const LAYER_KEYS = Object.keys(LAYER_MAP);

/**
 * Extract the project title from a Context Cloud header line.
 * Handles formats:
 *   "Context Cloud: My Title — [total items: N]"
 *   "Context Cloud: My Title — v1 (AI-started)"
 *   "Context Cloud: My Title — v3"
 */
export function extractProjectTitle(text: string): string | null {
  // Match "Context Cloud: TITLE — anything"
  const match = text.match(/Context Cloud:\s*(.+?)\s*[—–-]/i);
  if (!match) return null;
  const title = match[1].trim();
  // Filter out noise: if the "title" is just a bracket or version marker
  if (!title || title.startsWith('[') || title.startsWith('v') && title.length < 4) return null;
  return title;
}

/**
 * Check if the AI has signalled the cloud is complete.
 */
export function isCompletionSignal(text: string): boolean {
  return /your cloud is rich enough to generate from/i.test(text);
}

/**
 * Parse a single AI message and extract all cloud items.
 */
export function parseCloudItems(text: string): ParsedCloudItem[] {
  const items: ParsedCloudItem[] = [];
  const lines = text.split('\n');

  let currentType: CloudType | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this line is a layer heading (e.g. "CHARACTERS" or "**CHARACTERS**" or "CHARACTERS (3 items)")
    const headingCandidate = trimmed.replace(/\*+/g, '').trim().toUpperCase();
    // Exact match first, then startsWith to handle "CHARACTERS (3 items):" suffixes
    const matchedKey = LAYER_KEYS.find(k =>
      headingCandidate === k ||
      headingCandidate.startsWith(k + ' ') ||
      headingCandidate.startsWith(k + ':') ||
      headingCandidate.startsWith(k + '\t')
    );
    if (matchedKey) {
      currentType = LAYER_MAP[matchedKey];
      continue;
    }

    // Check for bullet items: • Name — Description [→ cross-ref]
    if (currentType && /^[•\-\*]\s+/.test(trimmed)) {
      const bulletContent = trimmed.replace(/^[•\-\*]\s+/, '');
      const item = parseBulletItem(bulletContent, currentType);
      if (item) items.push(item);
      continue;
    }

    // Collect sub-lines (sensory anchors, continuations) for the last item in current layer
    // e.g. "Light: cold blue maintenance lamps" / "Sound: distant hull pings"
    if (
      currentType &&
      trimmed.length > 0 &&
      items.length > 0 &&
      items[items.length - 1].cloud_type === currentType &&
      /^[A-Z][a-z]+:/.test(trimmed) // "Light:", "Sound:", "Smell:", etc.
    ) {
      const last = items[items.length - 1];
      last.content = last.content
        ? `${last.content} | ${trimmed}`
        : trimmed;
    }
  }

  return items;
}

/**
 * Parse a single bullet line into a CloudItem.
 * Format: "Name — description [→ Layer: cross-ref]"
 */
function parseBulletItem(raw: string, cloudType: CloudType): ParsedCloudItem | null {
  if (!raw.trim()) return null;

  // Split on em-dash (—), en-dash (–), or double-hyphen (--)
  const dashMatch = raw.match(/^(.+?)\s*[—–]\s*(.+)$/);

  let title: string;
  let content: string;
  const tags: string[] = [];

  if (dashMatch) {
    title = dashMatch[1].trim();
    let desc = dashMatch[2].trim();

    // Extract cross-reference tags: [→ Layer: Item]
    const crossRefMatch = desc.match(/\[?\s*→\s*(\w+):\s*(.+?)\]?\s*$/);
    if (crossRefMatch) {
      tags.push(`→ ${crossRefMatch[1]}: ${crossRefMatch[2].trim()}`);
      desc = desc.replace(/\[?\s*→\s*\w+:\s*.+?\]?\s*$/, '').trim();
    }

    content = desc;
  } else {
    // No dash separator — entire line is title
    title = raw.trim();
    content = '';
  }

  // Clean up any markdown bold from title
  title = title.replace(/\*+/g, '').trim();

  if (!title) return null;

  return { cloud_type: cloudType, title, content, tags };
}

/**
 * Parse ALL messages in a conversation and return deduplicated items.
 * Later messages override earlier ones (by title + type).
 */
export function parseAllMessages(messages: { role: string; content: string }[]): ParsedCloudItem[] {
  const itemMap = new Map<string, ParsedCloudItem>();

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    const items = parseCloudItems(msg.content);
    for (const item of items) {
      const key = `${item.cloud_type}::${item.title.toLowerCase()}`;
      itemMap.set(key, item);
    }
  }

  return Array.from(itemMap.values());
}
