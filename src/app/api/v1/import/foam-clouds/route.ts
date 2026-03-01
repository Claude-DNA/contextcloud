import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';
import { unzipSync, strFromU8 } from 'fflate';

export const maxDuration = 60; // seconds — 4 parallel Gemini calls need headroom

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

// ── Single Gemini call ────────────────────────────────────────────────────
async function geminiCall(prompt: string): Promise<unknown> {
  const res = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

const SECTION_HEADER = `
SECTION MARKERS — the document may be markdown (.md) or plain text stripped from docx. Handle BOTH:

CHAPTER BOUNDARIES (any of these patterns):
- "## CHAPTER X — Title"  (markdown)
- "CHAPTER X — Title"     (plain text, possibly on its own line)
- "Chapter X —"           (variant)

SECTION HEADINGS (any of these patterns — look for the EMOJI):
- "### 📖 PLOT" or just "📖 PLOT" or a line containing "📖" → plot/story content follows
- "### 👤 CHARACTERS" or "👤 CHARACTERS" → character descriptions follow
- "### 🎭 STAGE" or "🎭 STAGE" → location/setting description follows
- "### 🌍 UNIVERSE" or "🌍 UNIVERSE" → world concepts follow
- "### ✨ DETAILS" or "✨ DETAILS" or "DETAILS — REFERENCES" → references follow (🎬 film 🎵 music 🖼️ art 📚 book)
- "### 🔗 ASSOCIATIONS" or "🔗 ASSOCIATIONS" → thematic associations follow

OTHER:
- "| Character | ... |" table rows → character formula/arc data
- "# ACT X" or "ACT X:" → act label (Act 1 = The Seduction, Act 2 = The Capture, etc.)
- Lines starting with "- **Name**" or "**Name** —" → character/item entries
- Lines starting with "🎬" → film reference; "🎵" → music; "🖼️" → art; "📚" → book
`;

// ── Pass 1: Arc (chapters + plots) ───────────────────────────────────────
async function extractArc(text: string) {
  const prompt = `Extract the story arc structure from this document. The document is a story bible / chapter outline.
RETURN ONLY valid JSON — no markdown, no explanation.

Shape:
{"name":"story title","description":"one sentence","chapters":[{"name":"chapter name as written","plots":[{"name":"short plot title","content":"full plot description from the PLOT section"}]}]}

Rules:
1. STORY TITLE: Look for the main title at the top of the document. It should be something like "Foam on the Sand". Do NOT use "Imported Arc" or any generic name.
2. CHAPTERS: The document has 9 chapters (CHAPTER 1 through CHAPTER 9). Find each one using any of:
   - A line containing "CHAPTER" followed by a number and dash
   - A heading like "## CHAPTER 1 — Name" (markdown) OR "CHAPTER 1 — Name" (plain text)
   Collect ALL 9 chapters.
3. PLOTS: For each chapter, find the PLOT section (line/heading containing 📖 or "PLOT") and summarize it in 2-4 sentences max. Keep "content" concise — do NOT copy the entire section verbatim.
4. Preserve chapter order (1 through 9).
5. If a chapter has no 📖 section, use a brief summary of whatever story description follows the chapter heading.

${SECTION_HEADER}

DOCUMENT:
${text.slice(0, 80_000)}`;

  const data = await geminiCall(prompt) as {
    name: string; description: string;
    chapters: Array<{ name: string; plots: Array<{ name: string; content: string }> }>;
  };
  return data;
}

// ── Pass 2: Characters ────────────────────────────────────────────────────
async function extractCharacters(text: string) {
  const prompt = `Extract ALL named characters from this story document.
RETURN ONLY valid JSON array — no markdown, no explanation.

Shape:
[{"title":"Character name","content":"Full description — who they are, personality, role, what drives them, how they change","role":"Protagonist/Antagonist/Supporting/Squad/Alien/etc","arc":"Their full emotional formula journey across all acts, e.g. (Fear+Longing)×Wonder → (Guilt+Wonder)×Curiosity","tags":["tag1","tag2","tag3"]}]

Rules:
- ONE entry per unique character — DEDUPLICATE across all chapters
- Merge all information about each character from every chapter they appear in
- Include emotional formula notation if present (e.g. (Fear + Longing) × Wonder)
- The "arc" field = their complete formula journey across all acts from the formula table and character sections
- Extract: Daniel, Jane, Warrior Human, Explorer AI, The Squad, The Aliens, and any others named
- 3-5 tags per character

${SECTION_HEADER}

DOCUMENT:
${text.slice(0, 80_000)}`;

  return await geminiCall(prompt) as Array<{
    title: string; content: string; role: string; arc: string; tags: string[];
  }>;
}

// ── Pass 3: Stages + World ────────────────────────────────────────────────
async function extractStagesAndWorld(text: string) {
  const prompt = `Extract all STAGES and WORLD concepts from this story document.
RETURN ONLY valid JSON — no markdown, no explanation.

Shape:
{
  "stages": [{"title":"Stage name — State (exact as written)","content":"Full description including sensory details","act":"Act 1/2/3/etc","tags":["tag1","tag2"]}],
  "world": [{"title":"Concept name","content":"Full description","category":"System/Protocol/Faction/Technology/Ship/Civilization/Principle","tags":["tag1","tag2"]}]
}

Rules:
STAGES:
- Extract every location/setting from ### 🎭 STAGE sections
- Same place in different states = separate entries (e.g. "The Great Nebula — Arrival state" and "The Great Nebula — Battle state")
- Include all sensory details from the SENSORY lines
- DEDUPLICATE exact same title

WORLD:
- Extract every named concept from ### 🌍 UNIVERSE sections: protocols, factions, ships, technologies, civilizations, systems, principles
- One entry per concept
- DEDUPLICATE
- category must be one of: System, Protocol, Faction, Technology, Ship, Civilization, Principle, Mechanic

${SECTION_HEADER}

DOCUMENT:
${text.slice(0, 80_000)}`;

  return await geminiCall(prompt) as {
    stages: Array<{ title: string; content: string; act: string; tags: string[] }>;
    world: Array<{ title: string; content: string; category: string; tags: string[] }>;
  };
}

// ── Pass 4: References ────────────────────────────────────────────────────
async function extractReferences(text: string) {
  const prompt = `Extract ALL film, music, art, and book references from this story document.
RETURN ONLY valid JSON array — no markdown, no explanation.

Shape:
[{"title":"Work title (year if given)","content":"Why referenced — emotional/thematic connection note","refType":"film OR music OR art OR book","chapter":"Chapter X name where it appears"}]

Rules:
- 🎬 lines → refType: "film"
- 🎵 lines → refType: "music"
- 🖼️ lines → refType: "art"
- 📚 lines → refType: "book"
- Extract EVERY reference line — do not skip any
- "content" = the note/description after the dash on that line
- DEDUPLICATE by title (if same work appears in multiple chapters, keep the richest note)
- "chapter" = the ## CHAPTER heading it appears under

${SECTION_HEADER}

DOCUMENT:
${text.slice(0, 80_000)}`;

  return await geminiCall(prompt) as Array<{
    title: string; content: string; refType: 'film' | 'music' | 'art' | 'book'; chapter: string;
  }>;
}

// ── Pass 5: Ideas (themes + associations) ────────────────────────────────
async function extractIdeas(text: string): Promise<string[]> {
  const prompt = `Extract the key thematic ideas, associations, and insights from this story document.
RETURN ONLY a valid JSON array of strings — no markdown, no explanation.

Shape: ["idea text 1", "idea text 2", ...]

Rules:
- Extract from ### 🔗 ASSOCIATIONS sections: every bullet point is an idea
- Extract from thematic statements (e.g. the Three Traps principle, the ocean answer, the return journey principle, alignment failure/success/health)
- Extract key quoted lines that capture the story's themes (e.g. "Nobody lied. They just didn't ask.")
- Each idea = one clear statement or quote (1-2 sentences max)
- Include the source attribution if given (e.g. — The Little Prince)
- Extract 20-40 ideas total
- No duplicates

${SECTION_HEADER}

DOCUMENT:
${text.slice(0, 80_000)}`;

  const data = await geminiCall(prompt) as string[];
  return Array.isArray(data) ? data : [];
}

// ── Orchestrate all passes ────────────────────────────────────────────────
async function extractWithGemini(text: string): Promise<ExtractedData & { ideas: string[] }> {
  if (!GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY not configured');

  const [arc, characters, stagesAndWorld, references, ideas] = await Promise.all([
    extractArc(text),
    extractCharacters(text),
    extractStagesAndWorld(text),
    extractReferences(text),
    extractIdeas(text),
  ]);

  return {
    arc,
    characters: characters || [],
    stages: stagesAndWorld?.stages || [],
    world: stagesAndWorld?.world || [],
    references: references || [],
    ideas: ideas || [],
  };
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
    ideas: 0,
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

  // ── Ideas ──────────────────────────────────────────────────────────────
  const ideaTexts: string[] = (extracted as ExtractedData & { ideas?: string[] }).ideas || [];
  for (const ideaText of ideaTexts) {
    if (!ideaText?.trim()) continue;
    try {
      // Deduplicate
      const existing = await query(
        'SELECT id FROM ideas WHERE project_id=$1 AND text=$2 LIMIT 1',
        [userId, ideaText.trim()]
      );
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO ideas (project_id, text, weight, sort_order) VALUES ($1,$2,1.0,0)`,
          [userId, ideaText.trim()]
        );
        // Shift existing ideas down
        await query(
          'UPDATE ideas SET sort_order = sort_order + 1 WHERE project_id=$1 AND text!=$2',
          [userId, ideaText.trim()]
        );
      }
      stats.ideas++;
    } catch (e) {
      console.error('Idea import error:', ideaText.slice(0, 50), e);
    }
  }

  return NextResponse.json({ ok: true, stats });
}
