import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { unzipSync, strFromU8 } from 'fflate';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// Mutable per-invocation key - set at start of POST handler
let GOOGLE_AI_API_KEY = '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const VALID_CLOUD_TYPES = ['characters', 'references', 'scenes', 'world', 'ideas', 'arc'] as const;
type CloudType = typeof VALID_CLOUD_TYPES[number];

// Represents extracted file content — either plain text or raw bytes for Gemini inline
type FileContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary'; mimeType: string; base64: string };

async function extractFileContent(file: File): Promise<FileContent> {
  const name = file.name.toLowerCase();

  // ── Plain text ──────────────────────────────────────────────────────────────
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { kind: 'text', text: await file.text() };
  }

  // ── DOCX — paragraph-aware extraction ──────────────────────────────────────
  if (name.endsWith('.docx')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const unzipped = unzipSync(bytes);
      const paragraphs: string[] = [];

      // Pull text from document + any headers/footers
      const xmlSlots = [
        'word/document.xml',
        'word/header1.xml', 'word/header2.xml', 'word/header3.xml',
        'word/footer1.xml', 'word/footer2.xml',
      ];

      for (const slot of xmlSlots) {
        const xmlBytes = unzipped[slot];
        if (!xmlBytes) continue;
        const xml = strFromU8(xmlBytes);

        // Walk paragraph by paragraph so we preserve line breaks
        const paraRx = /<w:p[ >][\s\S]*?<\/w:p>/g;
        const runRx  = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
        let pMatch: RegExpExecArray | null;
        while ((pMatch = paraRx.exec(xml)) !== null) {
          const runs: string[] = [];
          let rMatch: RegExpExecArray | null;
          while ((rMatch = runRx.exec(pMatch[0])) !== null) {
            if (rMatch[1]) runs.push(rMatch[1]);
          }
          const line = runs.join('').trim();
          if (line) paragraphs.push(line);
        }
      }

      if (paragraphs.length > 0) {
        return { kind: 'text', text: paragraphs.join('\n').slice(0, 50000) };
      }

      // Fallback: strip all XML tags from document.xml
      const docXml = unzipped['word/document.xml'];
      if (docXml) {
        const raw = strFromU8(docXml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { kind: 'text', text: raw.slice(0, 50000) };
      }
      throw new Error('No readable content found in DOCX');
    } catch {
      // Last resort: decode raw bytes and strip XML
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return { kind: 'text', text: raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50000) };
    }
  }

  // ── PDF — send raw bytes to Gemini as inline document ───────────────────────
  if (name.endsWith('.pdf')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = Buffer.from(bytes).toString('base64');
    return { kind: 'binary', mimeType: 'application/pdf', base64 };
  }

  // ── EPUB — unzip and extract OPS/content HTML files ────────────────────────
  if (name.endsWith('.epub')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const unzipped = unzipSync(bytes);
      const textParts: string[] = [];
      for (const [path, data] of Object.entries(unzipped)) {
        if (/(\.xhtml|\.html|\.htm)$/i.test(path)) {
          const html = strFromU8(data as Uint8Array);
          const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (stripped.length > 100) textParts.push(stripped);
        }
      }
      if (textParts.length > 0) {
        return { kind: 'text', text: textParts.join('\n\n').slice(0, 50000) };
      }
    } catch { /* fall through */ }
    return { kind: 'text', text: '' };
  }

  // ── RTF — strip RTF control words ───────────────────────────────────────────
  if (name.endsWith('.rtf')) {
    const raw = await file.text();
    const stripped = raw
      .replace(/\{[^{}]*\}/g, ' ')     // remove groups
      .replace(/\\[a-z]+\d*\s?/g, '')  // remove control words
      .replace(/[{}\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { kind: 'text', text: stripped.slice(0, 50000) };
  }

  // ── Unknown: try as text ────────────────────────────────────────────────────
  return { kind: 'text', text: (await file.text()).slice(0, 50000) };
}

interface ExtractedItem {
  cloud_type: string;
  title: string;
  content: string;
  tags: string[];
}

function buildCharacterTransformBlock(): string {
  return `
━━━ CHARACTER TRANSFORMATION MODE (overrides default arc organization) ━━━
Your primary focus is HOW characters change across the story.

CHARACTERS layer — for every character item, include:
  1. BEFORE STATE: who they are at the story's opening (beliefs, fears, behavior patterns)
  2. CATALYST: the event or relationship that forces change
  3. RESISTANCE: what they cling to — why change is hard for this specific person
  4. AFTER STATE: who they become (or fail to become) by the end
  5. CENTRAL CONTRADICTION: what they want vs what they actually need
  6. TRANSFORMATION AGENTS: which other characters or events drive the arc

ARC layer — organize beats around CHARACTER TURNING POINTS, not plot events:
  - Each beat title should name whose transformation it marks and how
  - Example: "Daniel's First Betrayal of the Creed" not "Act 2 Rising Action"

IDEAS layer — focus on themes that directly DRIVE or REFLECT character transformation.
  Each idea item: the tension → how it lives inside a specific character → what it costs them.

All other layers (scenes, world, references) — extract normally as supporting context.
`;
}

async function callGeminiExtract(input: FileContent, structureBlock = '', temperatureBlock = '', characterTransformBlock = '', geminiTemperature = 0.7): Promise<ExtractedItem[]> {
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

${structureBlock}
${temperatureBlock}
${characterTransformBlock}
${input.kind === 'text'
  ? `━━━ SOURCE TEXT ━━━\n${input.text.slice(0, 30000)}`
  : `━━━ SOURCE DOCUMENT ━━━\nThe attached document is the source material. Read it fully, then map all content to the six layers.`
}`;

  if (!GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY not configured');
  }

  // Build content parts — PDF is sent as inline binary, everything else as text
  const parts: object[] = input.kind === 'binary'
    ? [{ text: prompt }, { inlineData: { mimeType: input.mimeType, data: input.base64 } }]
    : [{ text: prompt }];

  const res = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: geminiTemperature,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Parse JSON from response (strip code fences if present)
  const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array from extraction');
  }

  // Normalize cloud_type aliases (Gemini sometimes uses wrong names)
  const TYPE_ALIASES: Record<string, string> = {
    stage: 'scenes', location: 'scenes', setting: 'scenes',
    themes: 'ideas', theme: 'ideas', concept: 'ideas',
    arcs: 'arc', beats: 'arc', beat: 'arc', plot: 'arc', chapter: 'arc',
    reference: 'references', source: 'references',
    character: 'characters',
    worlds: 'world', universe: 'world', rule: 'world',
  };

  // Validate and normalize cloud_types
  return (parsed as ExtractedItem[])
    .map(item => ({
      ...item,
      cloud_type: TYPE_ALIASES[item.cloud_type] ?? item.cloud_type,
    }))
    .filter(item =>
      VALID_CLOUD_TYPES.includes(item.cloud_type as CloudType) && item.title?.trim()
    );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const resolvedKey = await getGeminiKey(session.user.id, session.user.email);
  if (!resolvedKey) return noKeyResponse();
  GOOGLE_AI_API_KEY = resolvedKey;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const supported = ['.txt', '.md', '.docx', '.pdf', '.epub', '.rtf'];
    if (!supported.some(ext => name.endsWith(ext))) {
      return NextResponse.json({ error: 'Unsupported file type. Use TXT, MD, DOCX, PDF, EPUB, or RTF.' }, { status: 400 });
    }

    const fileContent = await extractFileContent(file);
    const structureId    = formData.get('structure')      as string | null;
    const structureName  = formData.get('structureName')  as string | null;
    const structureBeats = formData.get('structureBeats') as string | null;
    const temperatureRaw = formData.get('temperature')    as string | null;
    const modeRaw        = formData.get('mode')           as string | null;
    const temperature    = temperatureRaw ? parseFloat(temperatureRaw) : 0.5;
    const mode           = modeRaw === 'character' ? 'character' : 'structure';

    // Map user temperature (0–1) to Gemini temperature
    // Strict Mirror (0.0) → 0.2 (needs some variance for quality), Co-Author (0.8) → 0.9
    const geminiTemperature = mode === 'character'
      ? Math.max(0.4, Math.min(1.0, temperature + 0.1))  // character mode: slightly warmer
      : Math.max(0.2, Math.min(1.0, temperature + 0.2)); // structure mode: floor at 0.2

    const beats: string[] = structureBeats ? JSON.parse(structureBeats) : [];
    const structureBlock = mode === 'structure'
      ? (structureName && structureId !== 'custom' && beats.length > 0)
        ? 'STORY STRUCTURE: ' + structureName + '\n' +
          'Organize the ARC items to follow this structure. Use these as arc item titles in order:\n' +
          beats.map((b, i) => (i + 1) + '. ' + b).join('\n') + '\n'
        : (structureName && structureId !== 'custom')
        ? 'STORY STRUCTURE: ' + structureName + ' — use this structure to organize arc beats.\n'
        : ''
      : '';

    const temperatureBlock = temperature >= 0.5
      ? 'TEMPERATURE: ' + temperature.toFixed(1) + ' — Co-Author Mode. After extracting all facts, you MAY propose additional items implied by the source. Label suggested items with tags: ["suggested"].'
      : 'TEMPERATURE: ' + temperature.toFixed(1) + ' — Strict Mirror. Extract only. Do not add, infer, or suggest anything not in the source text.';

    const characterTransformBlock = mode === 'character' ? buildCharacterTransformBlock() : '';

    const isEmpty = fileContent.kind === 'text'
      ? (!fileContent.text || fileContent.text.trim().length < 10)
      : fileContent.base64.length < 100;
    if (isEmpty) {
      return NextResponse.json({ error: 'File appears to be empty or could not be read' }, { status: 400 });
    }

    // Extract items using Context Cloud Architect prompt
    const items = await callGeminiExtract(fileContent, structureBlock, temperatureBlock, characterTransformBlock, geminiTemperature);

    if (items.length === 0) {
      return NextResponse.json({ error: 'No items could be extracted from the file' }, { status: 400 });
    }

    // Save to cloud_items using batch insert
    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }
    await runMigrations();

    // Deduplicate: skip items whose (cloud_type, lower(title)) already exist for this user
    const existingRes = await query(
      `SELECT LOWER(title) AS ltitle, cloud_type FROM cloud_items WHERE user_id = $1`,
      [session.user.id]
    );
    const existingSet = new Set(existingRes.rows.map(
      (r: { ltitle: string; cloud_type: string }) => `${r.cloud_type}::${r.ltitle}`
    ));
    const newItems = items.filter(item =>
      !existingSet.has(`${item.cloud_type}::${item.title.trim().toLowerCase()}`)
    );

    if (newItems.length === 0) {
      return NextResponse.json({ saved: 0, items: [], skipped: items.length, errors: [] });
    }

    // Get current max sort_order per type
    const typeList = [...new Set(newItems.map(i => i.cloud_type))];
    const maxRes = await query(
      `SELECT cloud_type, COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM cloud_items
       WHERE user_id = $1 AND cloud_type = ANY($2)
       GROUP BY cloud_type`,
      [session.user.id, typeList]
    );
    const nextOrderMap: Record<string, number> = {};
    for (const row of maxRes.rows) {
      nextOrderMap[row.cloud_type] = parseInt(row.next_order, 10);
    }
    const typeCounters: Record<string, number> = {};

    // Build bulk insert
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;

    for (const item of newItems) {
      const base = nextOrderMap[item.cloud_type] ?? 0;
      const offset = typeCounters[item.cloud_type] ?? 0;
      typeCounters[item.cloud_type] = offset + 1;
      const sortOrder = base + offset;

      const metadata = JSON.stringify({ source: 'file' });
      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      values.push(session.user.id, item.cloud_type, item.title.trim(), item.content || '', item.tags || [], metadata, sortOrder);
    }

    const insertSQL = `
      INSERT INTO cloud_items (user_id, cloud_type, title, content, tags, metadata, sort_order)
      VALUES ${placeholders.join(', ')}
      RETURNING id, cloud_type, title
    `;

    const result = await query(insertSQL, values);

    return NextResponse.json({
      saved: result.rowCount,
      items: result.rows,
      skipped: items.length - newItems.length,
      errors: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
