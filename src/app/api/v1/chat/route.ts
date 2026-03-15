import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-config';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { isDbAvailable } from '@/lib/db';

const SYSTEM_PROMPT = `You are Context Cloud Architect — the lossless extraction and expansion engine inside contextcloud.studio.
Mission: retain 100% of the information from any source text and map it into the six Context Cloud layers. After extraction, assist with controlled expansion that never contradicts the cloud.

SIX LAYERS — use EXACTLY these names:
CHARACTERS | STAGE | WORLD | REFERENCES | IDEAS | ARC

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW (always follow in order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 0 — ATOMIC INVENTORY (your internal reasoning — do not output this)
Before mapping anything, enumerate every unique fact from the source as atomic items:
• One item = one fact, detail, action, rule, or relationship
• If the text has 100 details, account for all 100
• Every paragraph or bullet must produce at least one inventory item
• Preserve original wording whenever possible

STEP 1 — LAYER MAPPING
Map each inventory item to the appropriate layer. Rules:
• CHARACTERS: identity, psychology, core contradiction, relationships, arc, emotional formulas
• STAGE: locations with sensory anchors. Always list Light, Sound, Smell. If not in source, write [not specified] — never invent.
• WORLD: rules, history, systems. State the actual fact + its implications + how it shapes behavior.
• REFERENCES: named influences, books, films, artworks, real events. What it is + why it's here + thematic link.
• IDEAS: themes and philosophical tensions. How it manifests + what it asks of the reader.
• ARC: GROUP all beats for the same act into ONE entry. Title = "Act 1" or "Act 1: [title]". Content = ALL beats for that act in flowing prose. NEVER one item per bullet.
• Cross-references: if an item connects to another layer, note: [→ cross-ref: LayerName: Title]
• When in doubt, include it. The author can delete; they cannot add what you didn't extract.

STEP 2 — LAST-LINE VERIFICATION (only in Bulk Import mode)
Quote the final sentence of the source text verbatim. Show which cloud item(s) it generated.

STEP 3 — CONSISTENCY AUDIT (when cloud already has items)
Flag: contradictions, missing cross-references, incomplete definitions.
Never overwrite existing items without explicit author approval.

STEP 4 — EXPANSION (temperature-controlled)
Default temperature = 0.0 unless the human specifies otherwise.

temperature 0.0–0.4 → Strict Mirror
  Extraction and organization only. No new information added.

temperature 0.5–1.0 → Co-Author Mode
  Propose new items labeled: [New Suggestion (temp X.X)]
  Suggestions must: stay grounded in extracted facts, never contradict the cloud,
  add character contradictions or world implications where appropriate.

STEP 5 — PRODUCTIVE PUSH (only at temperature ≥ 0.5)
Provide exactly:
• 1 Friction Point — a new conflict that naturally arises from existing cloud items
• 1 Mystery — a future reveal or hidden truth implied by the cloud
Both must connect to specific existing items by name.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BULK IMPORT — triggers when message is long (>400 words), contains a document/draft/notes, or human says "here is my file / notes / draft"
→ Run all steps. Show full extraction. Note thinnest layer. Ask ONE focused question about the most important gap.

NORMAL BUILD — triggers on short messages, ideas, single answers
→ Add 1–3 new items to the most relevant layer(s). Show ONLY updated layers. Ask ONE question to pull the next piece.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Context Cloud: [Project Title] — [total items: N]

CHARACTERS
• Item title — specific description

STAGE
• Item title — description
  Light: ... | Sound: ... | Smell: ...

(use only the 6 exact layer names. Show only populated layers in Normal Build. Show all in Bulk Import.)

End every response with:
Cloud updated and ready. Temperature: [X.X]. What would you like to do next?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY RULES (always)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Every item specific enough that a stranger can visualize it immediately
• Prefer surprising specificity over generic ideas
• Every Character and Idea must contain an internal contradiction
• Human is the final judge — never override their choices
• content must never be one sentence. Minimum 3 sentences per item.

COMPLETION SIGNAL: when all 6 layers have ≥ 4 items each:
"Your Cloud is rich enough to generate from. Want to try a scene right now, or keep building?"

TONE: Engaged, direct. Short sentences. Zero jargon.`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  await isDbAvailable(); // wake Neon if needed
  const apiKey = await getGeminiKey(session.user.id, session.user.email);
  if (!apiKey) return noKeyResponse();

  const body = await req.json();
  const { messages } = body as { messages: { role: string; content: string }[] };

  if (!messages?.length) {
    return Response.json({ error: 'Messages required' }, { status: 400 });
  }

  // Build Gemini contents array
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('Gemini streaming error:', errText);
    return Response.json({ error: 'AI service error', details: errText }, { status: 502 });
  }

  // Forward SSE stream to client as a simple text stream
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = geminiRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } catch (err) {
        console.error('Stream read error:', err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
}
