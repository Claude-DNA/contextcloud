import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { unzipSync, strFromU8 } from 'fflate';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// Mutable per-invocation key — set at start of POST handler
let GOOGLE_AI_API_KEY = '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const VALID_CLOUD_TYPES = ['characters', 'references', 'scenes', 'world', 'ideas', 'arc'] as const;
type CloudType = typeof VALID_CLOUD_TYPES[number];

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return await file.text();
  }

  if (name.endsWith('.docx')) {
    // DOCX = ZIP archive — properly decompress with fflate
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    try {
      const unzipped = unzipSync(bytes);

      // word/document.xml contains the main text
      const docXmlBytes = unzipped['word/document.xml'];
      if (!docXmlBytes) {
        throw new Error('Could not find word/document.xml in DOCX');
      }

      const xmlStr = strFromU8(docXmlBytes);

      // Extract text from <w:t> tags (Word text runs)
      const textParts: string[] = [];
      const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let match;
      while ((match = regex.exec(xmlStr)) !== null) {
        if (match[1].trim()) textParts.push(match[1]);
      }

      // Also extract paragraph breaks for readability
      const withBreaks = xmlStr.replace(/<w:p[ >]/g, '\n').replace(/<[^>]+>/g, '');
      const cleanText = withBreaks.replace(/\s+/g, ' ').replace(/\n /g, '\n').trim();

      const extracted = textParts.length > 20 ? textParts.join(' ') : cleanText;
      return extracted.slice(0, 50000);
    } catch {
      // Fallback: strip tags from raw
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const raw = decoder.decode(bytes);
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50000);
    }
  }

  // For PDF and other types, return what we can
  return await file.text();
}

interface ExtractedItem {
  cloud_type: string;
  title: string;
  content: string;
  tags: string[];
}

async function callGeminiExtract(text: string): Promise<ExtractedItem[]> {
  const prompt = `You are a story analyst. Read the document below and extract its content into the 6-layer Context Cloud format.

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
- Arc: one beat per entry. Title = brief label ("Act 1: The Meeting"). Content = the FULL scene description from the source — preserve original language, details, emotional register, subtext. Do NOT summarize. If the source has 3 paragraphs for this beat, the content should have those 3 paragraphs.
- When in doubt, include it. The user can delete; they can't add what you didn't extract.
- Tags should be 1-3 relevant keywords per item.
- content fields must NEVER be empty strings. If a field has no dedicated text in the source, write 2-3 sentences synthesizing what's known about it.

Document text:
${text.slice(0, 30000)}`;

  if (!GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY not configured');
  }

  const res = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_API_KEY}`, {
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
    if (!name.endsWith('.txt') && !name.endsWith('.md') && !name.endsWith('.docx') && !name.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Unsupported file type. Use TXT, MD, DOCX, or PDF.' }, { status: 400 });
    }

    const text = await extractTextFromFile(file);
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'File appears to be empty or could not be read' }, { status: 400 });
    }

    // Extract items using CloudCompanion 6-layer format
    const items = await callGeminiExtract(text);

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
