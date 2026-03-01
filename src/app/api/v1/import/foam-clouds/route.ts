import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';
import { unzipSync, strFromU8 } from 'fflate';

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ── Text extraction ────────────────────────────────────────────────────────
async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return await file.text();
  }
  if (name.endsWith('.docx')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const unzipped = unzipSync(bytes);
    const xml = unzipped['word/document.xml'];
    if (!xml) throw new Error('Invalid DOCX — word/document.xml not found');
    const raw = strFromU8(xml);
    // Preserve paragraph breaks, strip tags
    const withBreaks = raw
      .replace(/<w:p[ >]/g, '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/\t/g, ' ')
      .replace(/\n +/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return withBreaks.slice(0, 120_000);
  }
  return await file.text();
}

// ── Gemini call ────────────────────────────────────────────────────────────
interface ExtractedData {
  arc: {
    name: string;
    description: string;
    chapters: Array<{
      name: string;
      plots: Array<{ name: string; content: string }>;
    }>;
  };
  characters: Array<{
    title: string;
    content: string;
    role: string;
    arc: string;
    tags: string[];
  }>;
  stages: Array<{
    title: string;
    content: string;
    act: string;
    tags: string[];
  }>;
  world: Array<{
    title: string;
    content: string;
    category: string;
    tags: string[];
  }>;
  references: Array<{
    title: string;
    content: string;
    refType: 'film' | 'music' | 'art' | 'book';
    chapter: string;
  }>;
}

async function extractWithGemini(text: string): Promise<ExtractedData> {
  if (!GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY not configured');

  const prompt = `You are a story analyst and structured data extractor. Parse the story document below and extract all elements into the JSON structure specified.

RETURN ONLY VALID JSON — no markdown, no code fences, no explanation.

Required JSON shape:
{
  "arc": {
    "name": "story title",
    "description": "one-sentence description",
    "chapters": [
      {
        "name": "Chapter name as written",
        "plots": [
          { "name": "Plot point title", "content": "Full plot description from the PLOT section" }
        ]
      }
    ]
  },
  "characters": [
    {
      "title": "Character name",
      "content": "Full description — who they are, what drives them, their emotional formula arc across all acts they appear in",
      "role": "Protagonist / Antagonist / Supporting / etc",
      "arc": "Emotional formula arc — e.g. (Fear + Longing) × Wonder → (Guilt + Wonder) × Curiosity",
      "tags": ["list", "of", "relevant", "tags"]
    }
  ],
  "stages": [
    {
      "title": "Stage name / state as written (e.g. The VR Meadows — Explorer NP state)",
      "content": "Full description of this location/state",
      "act": "Act 1 / Act 2 / etc",
      "tags": ["relevant", "tags"]
    }
  ],
  "world": [
    {
      "title": "Concept/system/faction name",
      "content": "Full description",
      "category": "System / Faction / Technology / Ship / Civilization / Protocol / etc",
      "tags": ["relevant", "tags"]
    }
  ],
  "references": [
    {
      "title": "Work title (year if available)",
      "content": "Why it was referenced — the emotional/thematic connection",
      "refType": "film OR music OR art OR book",
      "chapter": "Chapter where it appears"
    }
  ]
}

EXTRACTION RULES:
1. CHARACTERS: One entry per unique character. DEDUPLICATE across chapters — merge all information about each character into a single rich entry. Include emotional formula arcs if present (shown as mathematical notation like (Fear + Longing) × Wonder). The "arc" field must capture their full emotional journey across all acts.
2. STAGES: One entry per unique location/state. DEDUPLICATE — same place in different states = separate entries (e.g. "Nebula — Arrival" and "Nebula — Battle" are different entries). Include sensory details from the SENSORY section.
3. WORLD: Extract every named system, faction, technology, ship, protocol, or civilization concept from UNIVERSE sections. One entry per concept. DEDUPLICATE.
4. REFERENCES: Extract every 🎬 (film), 🎵 (music), 🖼️ (art), 📚 (book) reference. Each line = one entry. refType must be exactly: film, music, art, or book.
5. ARC: Preserve chapter order. Each chapter gets its PLOT section content as a plot entry. If a chapter has multiple plot points, split them into separate plot objects.
6. Be THOROUGH — extract EVERYTHING. Do not summarize or omit. The content fields should be rich and complete.
7. Tags should be 3-6 meaningful keywords per item.

SECTION FORMAT (the document uses these markers):
- ## CHAPTER X — Title → chapter boundary
- ### 📖 PLOT → plot content
- ### 👤 CHARACTERS → character descriptions  
- ### 🎭 STAGE → stage/location
- ### 🌍 UNIVERSE → world concepts
- ### 🔗 ASSOCIATIONS → thematic connections (include notable ones in world entries)
- ### ✨ DETAILS — REFERENCES → 🎬 film, 🎵 music, 🖼️ art, 📚 book
- | Character | Act X | Formula | → formula table rows go into character arc fields
- Act headings (# ACT X) define which act a chapter belongs to

DOCUMENT:
${text.slice(0, 100_000)}`;

  const res = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed: ExtractedData = JSON.parse(cleaned);
  return parsed;
}

// ── DB helpers ─────────────────────────────────────────────────────────────
async function upsertCloudItem(
  userId: string,
  cloudType: string,
  title: string,
  content: string,
  tags: string[],
  metadata: Record<string, string>
): Promise<string> {
  // Check if item with same title+type already exists for this user
  const existing = await query(
    'SELECT id FROM cloud_items WHERE user_id=$1 AND cloud_type=$2 AND title=$3 LIMIT 1',
    [userId, cloudType, title]
  );
  if (existing.rows.length > 0) {
    // Update content if richer
    await query(
      'UPDATE cloud_items SET content=$1, tags=$2, metadata=$3, updated_at=NOW() WHERE id=$4',
      [content, tags, metadata, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const res = await query(
    `INSERT INTO cloud_items (user_id, cloud_type, title, content, tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [userId, cloudType, title, content, tags, metadata]
  );
  return res.rows[0].id;
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const userId = session.user.id;

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }
  await runMigrations();

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get('file') as File | null;
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  const name = file.name.toLowerCase();
  if (!name.endsWith('.md') && !name.endsWith('.txt') && !name.endsWith('.docx')) {
    return NextResponse.json({ error: 'Only .md, .txt, and .docx files are supported' }, { status: 400 });
  }

  // Extract text
  let text: string;
  try {
    text = await extractText(file);
  } catch (e) {
    return NextResponse.json({ error: `File read failed: ${(e as Error).message}` }, { status: 400 });
  }
  if (text.trim().length < 50) {
    return NextResponse.json({ error: 'File appears to be empty or unreadable' }, { status: 400 });
  }

  // Parse with Gemini
  let extracted: ExtractedData;
  try {
    extracted = await extractWithGemini(text);
  } catch (e) {
    return NextResponse.json({ error: `AI extraction failed: ${(e as Error).message}` }, { status: 500 });
  }

  const stats = {
    arc: { created: 0, chapters: 0, plots: 0 },
    characters: 0,
    stages: 0,
    world: 0,
    references: 0,
  };

  // ── Arc + Chapters + Plots ─────────────────────────────────────────────
  if (extracted.arc) {
    try {
      const arcName = extracted.arc.name || 'Imported Arc';
      // Check if arc exists
      const existingArc = await query(
        'SELECT id FROM arcs WHERE user_id=$1 AND name=$2 LIMIT 1',
        [userId, arcName]
      );
      let arcId: string;
      if (existingArc.rows.length > 0) {
        arcId = existingArc.rows[0].id;
      } else {
        const arcRes = await query(
          'INSERT INTO arcs (user_id, name, description) VALUES ($1,$2,$3) RETURNING id',
          [userId, arcName, extracted.arc.description || '']
        );
        arcId = arcRes.rows[0].id;
        stats.arc.created = 1;
      }

      for (let ci = 0; ci < (extracted.arc.chapters || []).length; ci++) {
        const ch = extracted.arc.chapters[ci];
        // Check if chapter exists
        const existingCh = await query(
          'SELECT id FROM chapters WHERE arc_id=$1 AND name=$2 LIMIT 1',
          [arcId, ch.name]
        );
        let chId: string;
        if (existingCh.rows.length > 0) {
          chId = existingCh.rows[0].id;
        } else {
          const chRes = await query(
            'INSERT INTO chapters (arc_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id',
            [arcId, ch.name, ci]
          );
          chId = chRes.rows[0].id;
          stats.arc.chapters++;
        }

        for (let pi = 0; pi < (ch.plots || []).length; pi++) {
          const plt = ch.plots[pi];
          const existingPlt = await query(
            'SELECT id FROM plots WHERE chapter_id=$1 AND name=$2 LIMIT 1',
            [chId, plt.name]
          );
          if (existingPlt.rows.length === 0) {
            await query(
              'INSERT INTO plots (chapter_id, name, content, sort_order) VALUES ($1,$2,$3,$4)',
              [chId, plt.name, plt.content || '', pi]
            );
            stats.arc.plots++;
          }
        }
      }
    } catch (e) {
      console.error('Arc import error:', e);
    }
  }

  // ── Characters ─────────────────────────────────────────────────────────
  for (const ch of (extracted.characters || [])) {
    if (!ch.title?.trim()) continue;
    try {
      await upsertCloudItem(userId, 'characters', ch.title, ch.content || '', ch.tags || [], {
        role: ch.role || '',
        arc: ch.arc || '',
      });
      stats.characters++;
    } catch (e) {
      console.error('Character import error:', ch.title, e);
    }
  }

  // ── Stages ─────────────────────────────────────────────────────────────
  for (const st of (extracted.stages || [])) {
    if (!st.title?.trim()) continue;
    try {
      await upsertCloudItem(userId, 'scenes', st.title, st.content || '', st.tags || [], {
        act: st.act || '',
      });
      stats.stages++;
    } catch (e) {
      console.error('Stage import error:', st.title, e);
    }
  }

  // ── World ──────────────────────────────────────────────────────────────
  for (const w of (extracted.world || [])) {
    if (!w.title?.trim()) continue;
    try {
      await upsertCloudItem(userId, 'world', w.title, w.content || '', w.tags || [], {
        category: w.category || '',
      });
      stats.world++;
    } catch (e) {
      console.error('World import error:', w.title, e);
    }
  }

  // ── References ─────────────────────────────────────────────────────────
  for (const ref of (extracted.references || [])) {
    if (!ref.title?.trim()) continue;
    try {
      await upsertCloudItem(userId, 'references', ref.title, ref.content || '', [ref.refType || 'other', ref.chapter || ''].filter(Boolean), {
        refType: ref.refType || 'other',
        chapter: ref.chapter || '',
      });
      stats.references++;
    } catch (e) {
      console.error('Reference import error:', ref.title, e);
    }
  }

  return NextResponse.json({ ok: true, stats });
}
