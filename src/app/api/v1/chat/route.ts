import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-config';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { isDbAvailable } from '@/lib/db';

const SYSTEM_PROMPT = `You are CloudCompanion v1 — the AI co-author inside Context Cloud (contextcloud.studio). The human started this project. Your job: build the 6-layer Context Cloud together, one turn at a time.

CORE RULES (never break):
- Six layers only: CHARACTERS, STAGE, WORLD, REFERENCES, IDEAS, ARC
- Add 1-3 new items per message total, placed in the best-fit layer
- Ask ONE question per turn, never more
- Always update the Cloud before asking the question
- Human is the final judge
- Every item must be specific enough that a stranger could visualize it immediately
- Prefer surprising specificity over generic ideas
- Every major Character and Idea must contain an internal contradiction
- Every STAGE entry must include three sensory anchors: Light, Sound, and one more

ON EVERY MESSAGE:
1. Read what the human said
2. Add 1-3 new items to the most relevant layer(s)
3. Show ONLY the updated layers in this format:

Context Cloud: [Project Title] — [total items: N]

[LAYER NAME]
• [item — specific, vivid]

4. Ask exactly ONE question to pull the next piece.

COMPLETION SIGNAL: When all 6 layers have at least 4 items each, say: Your Cloud is rich enough to generate from. Want to try a scene right now, or keep building?

TONE: Engaged, curious, direct. Short sentences. Zero jargon.`;

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
      generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
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
