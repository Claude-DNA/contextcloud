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
  CHARACTER: 'characters',
  STAGE: 'scenes',
  SCENES: 'scenes',
  SCENE: 'scenes',
  LOCATIONS: 'scenes',
  WORLD: 'world',
  UNIVERSE: 'world',       // AI sometimes uses UNIVERSE instead of WORLD
  SETTING: 'world',
  REFERENCES: 'references',
  REFERENCE: 'references',
  IDEAS: 'ideas',
  IDEA: 'ideas',
  THEMES: 'ideas',
  THEME: 'ideas',
  ARC: 'arc',
  ARCS: 'arc',
  PLOT: 'arc',
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

    // Check if this line is a layer heading.
    // Strategy: strip EVERYTHING that isn't a letter/digit/space, then search for keywords.
    // This handles: "🌍 UNIVERSE", "**CHARACTERS**", "## STAGE", "💡 IDEAS (12 items)", etc.
    const lineUpper = trimmed.toUpperCase();
    // Quick check: skip lines that start with a bullet (they're items, not headings)
    const isBullet = /^[•\-\*]\s+/.test(trimmed);
    let matchedKey: string | undefined;
    if (!isBullet) {
      // Build a stripped version: keep only ASCII letters, digits, and spaces
      const stripped = lineUpper.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      // A heading line should be SHORT (the keyword alone or with a count)
      // and the keyword should be a complete word in the stripped string
      if (stripped.length > 0 && stripped.length < 60) {
        matchedKey = LAYER_KEYS.find(k => {
          // keyword must appear as a whole word (surrounded by space or at start/end)
          const re = new RegExp(`(?:^| )${k}(?:$| |\\(|:)`);
          return re.test(stripped);
        });
      }
    }
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
 *
 * Special case: if the LATEST assistant message is a full cloud snapshot
 * (contains "Context Cloud: ... [total items: N]"), use ONLY that message's
 * items — it's a complete re-extraction and supersedes everything before it.
 * This prevents old items from diluting a fresh bulk extraction.
 */
export function parseAllMessages(messages: { role: string; content: string }[]): ParsedCloudItem[] {
  // Find the latest assistant message
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const latest = assistantMessages[assistantMessages.length - 1];

  // If latest message is a full snapshot (contains "Context Cloud: ... [total items:")
  // use it exclusively — it's a bulk extraction
  if (latest && /Context Cloud:.*\[total items:\s*\d+\]/i.test(latest.content)) {
    const items = parseCloudItems(latest.content);
    if (items.length > 0) {
      // Deduplicate within this message (title + type)
      const itemMap = new Map<string, ParsedCloudItem>();
      for (const item of items) {
        const key = `${item.cloud_type}::${item.title.toLowerCase()}`;
        itemMap.set(key, item);
      }
      return Array.from(itemMap.values());
    }
  }

  // Default: merge all messages, later entries override earlier (by title + type)
  const itemMap = new Map<string, ParsedCloudItem>();
  for (const msg of assistantMessages) {
    const items = parseCloudItems(msg.content);
    for (const item of items) {
      const key = `${item.cloud_type}::${item.title.toLowerCase()}`;
      itemMap.set(key, item);
    }
  }

  return Array.from(itemMap.values());
}
