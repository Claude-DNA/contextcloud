import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { unzipSync, strFromU8 } from 'fflate';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { extractCloudItems } from '@/lib/extraction';


const VALID_CLOUD_TYPES = ['characters', 'references', 'scenes', 'world', 'ideas', 'arc'] as const;
type CloudType = typeof VALID_CLOUD_TYPES[number];

// Represents extracted file content — either plain text or raw bytes for Gemini inline
/** Longest source we read: about a 150,000-word novel. */
const MAX_SOURCE_CHARS = 1_000_000;

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
        return { kind: 'text', text: paragraphs.join('\n\n').slice(0, MAX_SOURCE_CHARS) };
      }

      // Fallback: strip all XML tags from document.xml
      const docXml = unzipped['word/document.xml'];
      if (docXml) {
        const raw = strFromU8(docXml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { kind: 'text', text: raw.slice(0, MAX_SOURCE_CHARS) };
      }
      throw new Error('No readable content found in DOCX');
    } catch {
      // Last resort: decode raw bytes and strip XML
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return { kind: 'text', text: raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_CHARS) };
    }
  }

  // ── PDF — send raw bytes to Gemini as inline document ───────────────────────
  if (name.endsWith('.pdf')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = Buffer.from(bytes).toString('base64');
    return { kind: 'binary', mimeType: 'application/pdf', base64 };
  }

  // ── EPUB — chapters in reading order (the OPF spine), paragraphs kept ───────
  if (name.endsWith('.epub')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const unzipped = unzipSync(bytes);
      const htmlToText = (html: string) =>
        html
          .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
          .replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, '\n\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
          .replace(/[ \t]+/g, ' ')
          .replace(/\n\s*\n\s*/g, '\n\n')
          .trim();
      const opfPath = Object.keys(unzipped).find((k) => k.toLowerCase().endsWith('.opf'));
      let ordered: string[] = [];
      if (opfPath) {
        const opf = strFromU8(unzipped[opfPath]);
        const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
        const hrefById = new Map<string, string>();
        for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
          const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
          const href = /\bhref="([^"]+)"/.exec(m[0])?.[1];
          if (id && href) hrefById.set(id, dir + decodeURIComponent(href));
        }
        ordered = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => hrefById.get(m[1])).filter((h): h is string => !!h && !!unzipped[h]);
      }
      if (ordered.length === 0) ordered = Object.keys(unzipped).filter((k) => /\.(xhtml|html|htm)$/i.test(k)).sort();
      const textParts = ordered.map((k) => htmlToText(strFromU8(unzipped[k] as Uint8Array))).filter((t) => t.length > 100);
      if (textParts.length > 0) {
        return { kind: 'text', text: textParts.join('\n\n').slice(0, MAX_SOURCE_CHARS) };
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
    return { kind: 'text', text: stripped.slice(0, MAX_SOURCE_CHARS) };
  }

  // ── Unknown: try as text ────────────────────────────────────────────────────
  return { kind: 'text', text: (await file.text()).slice(0, MAX_SOURCE_CHARS) };
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

export const maxDuration = 300; // long texts: up to 40 parts, 5 at a time

/**
 * POST multipart: file, project_id?, structure?, structureName?, structureBeats?, temperature?, mode?
 * Extracts cloud items chapter by chapter, saves them to the project (skipping titles it already has),
 * keeps the source text for quote checks and L5, and reports how much of the text was covered.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const apiKey = await getGeminiKey(userId);
  if (!apiKey) return noKeyResponse();

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

    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }
    await ensureSchema().catch(() => {});

    // The project the items go into; must belong to this user.
    const requestedProject = (formData.get('project_id') as string | null) || null;
    let projectId: string | null = null;
    if (requestedProject) {
      const owns = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [requestedProject, userId]);
      if (!owns.rows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      projectId = requestedProject;
    }

    const fileContent = await extractFileContent(file);
    const structureId    = formData.get('structure')      as string | null;
    const structureName  = formData.get('structureName')  as string | null;
    const structureBeats = formData.get('structureBeats') as string | null;
    const temperatureRaw = formData.get('temperature')    as string | null;
    const modeRaw        = formData.get('mode')           as string | null;
    const temperature    = temperatureRaw ? parseFloat(temperatureRaw) : 0.5;
    const mode           = modeRaw === 'character' ? 'character' : 'structure';

    // Strict Mirror (0.0) → 0.2, Co-Author (0.8) → 0.9; character mode runs slightly warmer.
    const geminiTemperature = mode === 'character'
      ? Math.max(0.4, Math.min(1.0, temperature + 0.1))
      : Math.max(0.2, Math.min(1.0, temperature + 0.2));

    const beats: string[] = structureBeats ? JSON.parse(structureBeats) : [];
    const structureHint = mode === 'structure' && structureName && structureId !== 'custom'
      ? `Follow the ${structureName} structure${beats.length ? `: ${beats.join(' / ')}` : ''}.`
      : '';
    const temperatureBlock = temperature >= 0.5
      ? 'TEMPERATURE ' + temperature.toFixed(1) + ' (Co-Author): after extracting every fact you MAY add items the source implies. Tag those with "suggested" and leave their source_quote empty.'
      : 'TEMPERATURE ' + temperature.toFixed(1) + ' (Strict Mirror): extract only. Add nothing that is not in the text.';
    const blocks = [temperatureBlock, mode === 'character' ? buildCharacterTransformBlock() : ''].join('\n');

    const isEmpty = fileContent.kind === 'text'
      ? (!fileContent.text || fileContent.text.trim().length < 10)
      : fileContent.base64.length < 100;
    if (isEmpty) {
      return NextResponse.json({ error: 'File appears to be empty or could not be read' }, { status: 400 });
    }

    const { items, coverage } = await extractCloudItems(fileContent, {
      apiKey,
      blocks,
      structureHint,
      temperature: geminiTemperature,
    });

    if (coverage.parts_extracted === 0) {
      return NextResponse.json({ error: 'The AI could not read this file. Try again, or upload it as TXT or DOCX.', coverage }, { status: 502 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: 'No items could be extracted from the file', coverage }, { status: 400 });
    }

    // Keep the text: the flow editor checks quotes against it and can publish it as L5.
    if (fileContent.kind === 'text') {
      // Uploading the same text again doesn't store (or later publish) it twice.
      await query(
        `INSERT INTO project_sources (user_id, project_id, filename, text)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM project_sources
           WHERE user_id = $1 AND project_id IS NOT DISTINCT FROM $2::uuid AND md5(text) = md5($4)
         )`,
        [userId, projectId, file.name, fileContent.text]
      );
    }

    // Skip titles this project already has (other projects are separate stories).
    const scope = projectId ? 'project_id = $2' : 'project_id IS NULL';
    const existingRes = await query(
      `SELECT LOWER(title) AS ltitle, cloud_type FROM cloud_items WHERE user_id = $1 AND ${scope}`,
      projectId ? [userId, projectId] : [userId]
    );
    const existingSet = new Set(existingRes.rows.map((r: { ltitle: string; cloud_type: string }) => `${r.cloud_type}::${r.ltitle}`));
    const newItems = items.filter(item => !existingSet.has(`${item.cloud_type}::${item.title.trim().toLowerCase()}`));

    if (newItems.length === 0) {
      return NextResponse.json({ saved: 0, items: [], skipped: items.length, coverage, errors: [] });
    }

    const maxRes = await query(
      `SELECT cloud_type, COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM cloud_items WHERE user_id = $1 AND ${scope} GROUP BY cloud_type`,
      projectId ? [userId, projectId] : [userId]
    );
    const nextOrder: Record<string, number> = {};
    for (const row of maxRes.rows) nextOrder[row.cloud_type] = parseInt(row.next_order, 10);

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const item of newItems) {
      const sortOrder = nextOrder[item.cloud_type] ?? 0;
      nextOrder[item.cloud_type] = sortOrder + 1;
      const metadata = JSON.stringify({
        source: 'file',
        filename: file.name,
        source_quote: item.source_quotes[0] ?? '',
        source_quotes: item.source_quotes,
        aliases: item.aliases,
        locations: item.locations,
        ...(item.initial_state ? { initial_state: item.initial_state } : {}),
        ...(item.cloud_type === 'arc'
          ? { when: item.when ?? 'main', act: item.act ?? '', act_number: item.act_number ?? null, beat_number: item.beat_number ?? null }
          : {}),
      });
      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, 'ai_extraction', $${p++})`);
      values.push(userId, projectId, item.cloud_type, item.title.trim(), item.content || '', item.tags, metadata, sortOrder, file.name);
    }
    const result = await query(
      `INSERT INTO cloud_items (user_id, project_id, cloud_type, title, content, tags, metadata, sort_order, source_type, source_ref)
       VALUES ${placeholders.join(', ')}
       RETURNING id, cloud_type, title`,
      values
    );

    return NextResponse.json({
      saved: result.rowCount,
      items: result.rows,
      skipped: items.length - newItems.length,
      coverage,
      errors: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
