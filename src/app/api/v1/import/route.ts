import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { unzipSync, strFromU8 } from 'fflate';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';

// Mutable per-invocation key — set at start of POST handler
let GOOGLE_AI_API_KEY = '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const VALID_NODE_TYPES = [
  'plot', 'character', 'scene', 'dialogue', 'world', 'theme', 'chapterAct',
  'musicReference', 'bookReference', 'artReference', 'realEventReference',
];

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

async function callGeminiAI(text: string): Promise<{
  title: string;
  nodes: Array<{ id: string; type: string; title: string; content: string; position: { x: number; y: number } }>;
  edges: Array<{ source: string; target: string }>;
}> {
  const prompt = `You are a story analyst. Read the document below and extract its actual content into a structured node graph.

Return ONLY valid JSON (no markdown, no code fences) with this shape:
{
  "title": "actual title of the story/document",
  "nodes": [
    { "id": "node_1", "type": "character", "title": "Character Name", "content": "Physical description, personality, role in story, motivations...", "position": { "x": 100, "y": 100 } }
  ],
  "edges": [
    { "source": "node_1", "target": "node_2" }
  ]
}

Available node types: ${VALID_NODE_TYPES.join(', ')}

CRITICAL RULES:
- Extract REAL content from the document — names, descriptions, events, quotes, themes
- The "content" field must contain actual text from the story, not generic placeholders
- For character nodes: include the character's actual name, description, and role
- For scene nodes: describe what actually happens in that scene
- For plot nodes: describe the actual plot point from the story
- For dialogue nodes: include actual quotes or paraphrased dialogue
- For theme nodes: state the actual theme with evidence from the text
- Use incremental IDs: node_1, node_2, etc.
- Create logical edges connecting related nodes (character appears in scene, plot leads to scene, etc.)
- Position nodes in a grid: columns ~250px apart, rows ~150px apart, start at x:100 y:100
- Create 8-20 nodes — more for longer/richer documents
- DO NOT create nodes with generic titles like "Plot Point" or "Setting" — use the actual names and details

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

  // Validate node types
  if (parsed.nodes) {
    parsed.nodes = parsed.nodes.filter((n: { type: string }) => VALID_NODE_TYPES.includes(n.type));
  }

  return parsed;
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

    const result = await callGeminiAI(text);

    return NextResponse.json({
      title: result.title,
      nodes: result.nodes,
      edges: result.edges,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
