/**
 * The one place Context Cloud talks to Gemini.
 *
 * Model IDs live here (overridable with GEMINI_MODEL / GEMINI_MODEL_LITE), so the next
 * model retirement is a one-line change. Gemini 2.0 Flash, used everywhere before,
 * was shut down on June 1, 2026.
 */

/** Main model: extraction, graph building, chat, flow drafting. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
/** Cheap model: tags, scores, short suggestions. */
export const GEMINI_MODEL_LITE = process.env.GEMINI_MODEL_LITE || 'gemini-3.5-flash-lite';

/** API base; tests point this at a local mock. */
const API_BASE = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type GeminiRequest = {
  apiKey: string;
  /** A prompt string, or parts (text plus inline files such as PDFs). */
  prompt: string | GeminiPart[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask for JSON output (responseMimeType application/json). */
  json?: boolean;
  /** Optional JSON schema for structured output; implies json. */
  schema?: Record<string, unknown>;
  systemInstruction?: string;
};

export class GeminiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function modelUrl(model: string, method: 'generateContent' | 'streamGenerateContent', apiKey: string): string {
  const sse = method === 'streamGenerateContent' ? 'alt=sse&' : '';
  return `${API_BASE}/models/${model}:${method}?${sse}key=${encodeURIComponent(apiKey)}`;
}

function body(req: GeminiRequest) {
  const parts = typeof req.prompt === 'string' ? [{ text: req.prompt }] : req.prompt;
  const generationConfig: Record<string, unknown> = {
    temperature: req.temperature ?? 0.7,
    maxOutputTokens: req.maxOutputTokens ?? 8192,
  };
  if (req.json || req.schema) generationConfig.responseMimeType = 'application/json';
  if (req.schema) generationConfig.responseSchema = req.schema;
  return {
    contents: [{ role: 'user', parts }],
    generationConfig,
    ...(req.systemInstruction ? { systemInstruction: { parts: [{ text: req.systemInstruction }] } } : {}),
  };
}

/** Calls Gemini and returns the text of the first candidate. Retries once on 429/5xx. */
export async function generate(req: GeminiRequest): Promise<string> {
  const model = req.model || GEMINI_MODEL;
  let last: GeminiError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(modelUrl(model, 'generateContent', req.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(req)),
    });
    if (res.ok) {
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts as { text?: string }[] | undefined;
      return (parts ?? []).map((p) => p.text ?? '').join('');
    }
    last = new GeminiError(`Gemini ${model} error ${res.status}: ${(await res.text()).slice(0, 500)}`, res.status);
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw last!;
}

/** Strips code fences and parses JSON; tolerates leading prose before the first { or [. */
export function parseJson<T = unknown>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error('Gemini did not return valid JSON');
  }
}

/** generate() + parseJson(), with JSON output mode on. */
export async function generateJson<T = unknown>(req: GeminiRequest): Promise<T> {
  return parseJson<T>(await generate({ ...req, json: true }));
}

/** Runs async jobs with at most `limit` running at once, keeping input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Maps model IDs saved in older canvases (gemini-2.0-flash, gemini-pro, …) to a model that still exists. */
export function resolveGeminiModel(id?: string | null): string {
  if (!id || /^gemini-(pro|1\.|2\.0)/.test(id)) return GEMINI_MODEL;
  return id;
}
