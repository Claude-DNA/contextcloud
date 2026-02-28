import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';

interface SuggestBody {
  nodeType: string;
  nodeTitle: string;
  nodeContent: string;
  connections: Array<{ type: string; title: string; content: string }>;
  proxies: Array<{ type: string; elements: string[] }>;
  aiNode?: { model: string; apiKey: string; systemPrompt?: string; temperature?: number };
}

function buildPrompt(body: SuggestBody): string {
  const { nodeType, nodeTitle, nodeContent, connections, proxies } = body;

  const connectionsText = connections?.length
    ? connections.map(c => `- ${c.type}: "${c.title}" — ${c.content}`).join('\n')
    : 'None';

  const proxiesText = proxies?.length
    ? proxies.map(p => `- ${p.type}: [${p.elements.join(', ')}]`).join('\n')
    : 'None';

  return `You are a creative writing assistant helping with a ${nodeType} node titled "${nodeTitle}" in a story structure graph. The node contains: ${nodeContent || '(empty)'}. It connects to:\n${connectionsText}\nInjected context (proxies):\n${proxiesText}\nProvide 3-5 specific, concrete suggestions to develop this ${nodeType} further. Be specific to the content provided, not generic. Keep suggestions brief (1-2 sentences each). Return ONLY a JSON array of strings, no markdown fences.`;
}

function parseSuggestions(text: string): string[] {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.map(String);
    return [String(parsed)];
  } catch {
    return text.split('\n').filter((l: string) => l.trim().length > 0).slice(0, 5);
  }
}

async function callGemini(prompt: string, apiKey: string, model: string, temperature: number): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API error: ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
}

async function callAnthropic(prompt: string, apiKey: string, model: string, temperature: number, systemPrompt?: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`);
  const data = await res.json();
  return data?.content?.[0]?.text || '[]';
}

async function callOpenAI(prompt: string, apiKey: string, model: string, temperature: number, systemPrompt?: string): Promise<string> {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '[]';
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json() as SuggestBody;
  const prompt = buildPrompt(body);
  const { aiNode } = body;

  try {
    let text: string;

    if (aiNode?.apiKey && aiNode?.model) {
      // Route to the AI node's configured model
      const temperature = aiNode.temperature ?? 0.7;

      if (aiNode.model.startsWith('claude-')) {
        text = await callAnthropic(prompt, aiNode.apiKey, aiNode.model, temperature, aiNode.systemPrompt);
      } else if (aiNode.model.startsWith('gpt-')) {
        text = await callOpenAI(prompt, aiNode.apiKey, aiNode.model, temperature, aiNode.systemPrompt);
      } else {
        // Gemini models
        text = await callGemini(prompt, aiNode.apiKey, aiNode.model, temperature);
      }
    } else {
      // Default: use server-side Gemini API key
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not configured' }, { status: 500 });
      }
      text = await callGemini(prompt, apiKey, 'gemini-2.0-flash', 0.8);
    }

    const suggestions = parseSuggestions(text);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json({ error: `Failed to get suggestions: ${err}` }, { status: 500 });
  }
}
