/**
 * The one place Context Cloud talks to an AI model.
 *
 * Each user picks a provider (Google, Anthropic, OpenAI or OpenRouter), a model and, optionally,
 * a lighter model for small jobs (tags, scores), and brings their own key. Every route calls
 * generate() / generateJson() / streamText() with that config; this module turns the request into
 * the provider's API shape:
 *
 *   structured output   Google: responseSchema · Anthropic: a forced tool call · OpenAI and
 *                       OpenRouter: response_format json_schema, falling back to JSON mode, then
 *                       to the schema written into the prompt
 *   PDFs                Google: inline data · Anthropic: document block · OpenAI/OpenRouter: file part
 *   streaming           each provider's SSE format, reduced to plain text chunks
 *
 * Schemas are written once, in Gemini's style (type: 'OBJECT' | 'ARRAY' | 'STRING' …), and converted.
 */

import { parseJson } from './json';
export { parseJson };

export type Provider = 'google' | 'anthropic' | 'openai' | 'openrouter';
export const PROVIDERS: Provider[] = ['google', 'anthropic', 'openai', 'openrouter'];

export interface AiConfig {
  provider: Provider;
  apiKey: string;
  /** Main model: extraction, graph, flow drafts, chat. */
  model: string;
  /** Light model: tags, scores, short suggestions. Falls back to the main model. */
  lightModel?: string;
}

export const PROVIDER_INFO: Record<Provider, { label: string; keyUrl: string; keyHint: string; defaultModel?: string; defaultLight?: string }> = {
  google: {
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'AIza…',
    defaultModel: 'gemini-3.8-flash',
    defaultLight: 'gemini-3.5-flash-lite',
  },
  anthropic: {
    label: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    defaultModel: 'claude-haiku-5-5',
    defaultLight: 'claude-haiku-5-5',
  },
  openai: { label: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…' },
  openrouter: { label: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-…' },
};

/** API bases; tests point these at local stand-ins. */
const BASE = {
  google: (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
  anthropic: (process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com').replace(/\/$/, ''),
  openai: (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, ''),
  openrouter: (process.env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
};

export type Part = { text: string } | { file: { mimeType: string; data: string; name?: string } };
export type Schema = Record<string, unknown>;
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface GenerateRequest {
  ai: AiConfig;
  /** The user turn: a string, or parts (text plus files such as PDFs). */
  prompt: string | Part[];
  /** Standing instructions, sent as the provider's system prompt. */
  system?: string;
  /** Use the light model. */
  light?: boolean;
  /** Override the model for this call. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Structured output in this schema (Gemini style). */
  schema?: Schema;
  /** Ask for JSON without a schema. */
  json?: boolean;
}

export class AiError extends Error {
  constructor(message: string, public status: number, public provider: Provider) {
    super(message);
  }
}

export const modelFor = (req: Pick<GenerateRequest, 'ai' | 'light' | 'model'>) =>
  req.model || (req.light ? req.ai.lightModel || req.ai.model : req.ai.model);

// ── schema conversion ──────────────────────────────────────────────────────

/** Gemini-style schema → JSON Schema (lowercase types). */
export function toJsonSchema(s: Schema): Schema {
  const out: Schema = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'type' && typeof v === 'string') out.type = v.toLowerCase();
    else if (k === 'properties' && v && typeof v === 'object')
      out.properties = Object.fromEntries(Object.entries(v as Record<string, Schema>).map(([p, ps]) => [p, toJsonSchema(ps)]));
    else if (k === 'items' && v && typeof v === 'object') out.items = toJsonSchema(v as Schema);
    else out[k] = v;
  }
  return out;
}

/** Anthropic tools and OpenAI json_schema need an object at the root; arrays are wrapped in { items }. */
function rootObject(schema: Schema): { schema: Schema; wrapped: boolean } {
  const js = toJsonSchema(schema);
  if (js.type === 'object') return { schema: js, wrapped: false };
  return { schema: { type: 'object', properties: { items: js }, required: ['items'] }, wrapped: true };
}

const WRAP_NOTE = '\n\n(Return the array in the "items" field.)';

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Output allowance. Thinking models (Gemini 3, OpenAI reasoning models) count their reasoning against
 * it, so a small cap can leave nothing for the answer; only generated tokens are billed, so a floor costs nothing.
 */
const outputCap = (n?: number) => Math.max(n ?? 8192, 4096);

const partsOf = (p: string | Part[]): Part[] => (typeof p === 'string' ? [{ text: p }] : p);
const textOf = (p: string | Part[]) => partsOf(p).map((x) => ('text' in x ? x.text : '')).join('\n');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(provider: Provider, url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (res.ok || (res.status !== 429 && res.status < 500)) return res;
    last = res;
    await sleep(1500);
  }
  return last!;
}

async function fail(provider: Provider, model: string, res: Response): Promise<never> {
  const text = (await res.text()).slice(0, 600);
  throw new AiError(`${PROVIDER_INFO[provider].label} (${model}) error ${res.status}: ${text}`, res.status, provider);
}

/** Some models reject temperature (reasoning models) or a response format; the caller retries without. */
const rejects = (status: number, body: string, word: RegExp) => status === 400 && word.test(body);

// ── Google ─────────────────────────────────────────────────────────────────

function googleBody(req: GenerateRequest) {
  const parts = partsOf(req.prompt).map((p) => ('text' in p ? { text: p.text } : { inlineData: { mimeType: p.file.mimeType, data: p.file.data } }));
  const generationConfig: Record<string, unknown> = { maxOutputTokens: outputCap(req.maxTokens) };
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.json || req.schema) generationConfig.responseMimeType = 'application/json';
  if (req.schema) generationConfig.responseSchema = req.schema;
  return {
    contents: [{ role: 'user', parts }],
    generationConfig,
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
  };
}

async function googleGenerate(req: GenerateRequest): Promise<string> {
  const model = modelFor(req);
  const res = await post('google', `${BASE.google}/models/${model}:generateContent?key=${encodeURIComponent(req.ai.apiKey)}`, {}, googleBody(req));
  if (!res.ok) await fail('google', model, res);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts as { text?: string; thought?: boolean }[] | undefined;
  return (parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
}

// ── Anthropic ──────────────────────────────────────────────────────────────

function anthropicContent(prompt: string | Part[]) {
  return partsOf(prompt).map((p) =>
    'text' in p
      ? { type: 'text', text: p.text }
      : { type: 'document', source: { type: 'base64', media_type: p.file.mimeType, data: p.file.data } }
  );
}

async function anthropicGenerate(req: GenerateRequest): Promise<string> {
  const model = modelFor(req);
  const wrap = req.schema ? rootObject(req.schema) : null;
  const prompt = wrap?.wrapped ? [...partsOf(req.prompt), { text: WRAP_NOTE }] : req.prompt;
  const body: Record<string, unknown> = {
    model,
    max_tokens: outputCap(req.maxTokens),
    messages: [{ role: 'user', content: anthropicContent(prompt) }],
    ...(req.system ? { system: req.system } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  };
  if (wrap) {
    body.tools = [{ name: 'respond', description: 'Return the answer in this exact structure.', input_schema: wrap.schema }];
    body.tool_choice = { type: 'tool', name: 'respond' };
  }
  const headers = { 'x-api-key': req.ai.apiKey, 'anthropic-version': '2023-06-01' };
  let res = await post('anthropic', `${BASE.anthropic}/v1/messages`, headers, body);
  if (!res.ok) {
    const text = await res.clone().text();
    if (rejects(res.status, text, /temperature/i)) {
      delete body.temperature;
      res = await post('anthropic', `${BASE.anthropic}/v1/messages`, headers, body);
    }
  }
  if (!res.ok) await fail('anthropic', model, res);
  const data = await res.json();
  const blocks = (data?.content ?? []) as { type: string; text?: string; input?: Record<string, unknown> }[];
  if (wrap) {
    const tool = blocks.find((b) => b.type === 'tool_use');
    if (tool?.input) return JSON.stringify(wrap.wrapped ? tool.input.items ?? [] : tool.input);
  }
  return blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
}

// ── OpenAI and OpenRouter (chat completions) ───────────────────────────────

function chatContent(prompt: string | Part[]) {
  const parts = partsOf(prompt);
  if (parts.every((p) => 'text' in p)) return textOf(prompt);
  return parts.map((p) =>
    'text' in p
      ? { type: 'text', text: p.text }
      : { type: 'file', file: { filename: p.file.name || 'document.pdf', file_data: `data:${p.file.mimeType};base64,${p.file.data}` } }
  );
}

function chatHeaders(provider: 'openai' | 'openrouter', apiKey: string): Record<string, string> {
  return provider === 'openrouter'
    ? { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://contextcloud.studio', 'X-Title': 'Context Cloud Studio' }
    : { Authorization: `Bearer ${apiKey}` };
}

async function chatGenerate(provider: 'openai' | 'openrouter', req: GenerateRequest): Promise<string> {
  const model = modelFor(req);
  const wrap = req.schema ? rootObject(req.schema) : null;
  const userParts = wrap?.wrapped ? [...partsOf(req.prompt), { text: WRAP_NOTE }] : partsOf(req.prompt);
  const messages: Record<string, unknown>[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: chatContent(userParts) });

  const body: Record<string, unknown> = { model, messages };
  if (provider === 'openai') body.max_completion_tokens = outputCap(req.maxTokens);
  else body.max_tokens = outputCap(req.maxTokens);
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (wrap) body.response_format = { type: 'json_schema', json_schema: { name: 'response', schema: wrap.schema, strict: false } };
  else if (req.json) body.response_format = { type: 'json_object' };

  const url = `${BASE[provider]}/chat/completions`;
  const headers = chatHeaders(provider, req.ai.apiKey);
  let res = await post(provider, url, headers, body);
  // Step down until the model accepts the request: no temperature, then JSON mode, then the schema in the prompt.
  for (let i = 0; i < 3 && !res.ok; i++) {
    const text = await res.clone().text();
    if (rejects(res.status, text, /temperature/i) && 'temperature' in body) delete body.temperature;
    else if (rejects(res.status, text, /response_format|json_schema|structured/i) && body.response_format) {
      const rf = body.response_format as { type: string };
      if (rf.type === 'json_schema') body.response_format = { type: 'json_object' };
      else {
        delete body.response_format;
        if (wrap) messages[messages.length - 1] = { role: 'user', content: chatContent([...userParts, { text: `\n\nReply with JSON only, matching this JSON Schema:\n${JSON.stringify(wrap.schema)}` }]) };
      }
    } else break;
    res = await post(provider, url, headers, body);
  }
  if (!res.ok) await fail(provider, model, res);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? '').join('') : '';
  if (wrap?.wrapped) {
    try {
      const obj = parseJson<{ items?: unknown }>(text);
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && 'items' in obj) return JSON.stringify(obj.items ?? []);
    } catch { /* returned as is; parseJson upstream reports it */ }
  }
  return text;
}

// ── public API ─────────────────────────────────────────────────────────────

/** Calls the user's model and returns its text. Retries once on 429/5xx. */
export async function generate(req: GenerateRequest): Promise<string> {
  if (!modelFor(req)) throw new AiError('No model chosen. Pick one in Settings.', 400, req.ai.provider);
  switch (req.ai.provider) {
    case 'google': return googleGenerate(req);
    case 'anthropic': return anthropicGenerate(req);
    case 'openai': return chatGenerate('openai', req);
    case 'openrouter': return chatGenerate('openrouter', req);
  }
}

/** generate() with JSON output, parsed. */
export async function generateJson<T = unknown>(req: GenerateRequest): Promise<T> {
  return parseJson<T>(await generate({ ...req, json: true }));
}

/** Streams a conversation as plain text chunks. */
export async function streamText(req: {
  ai: AiConfig;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const { ai } = req;
  const model = ai.model;
  if (!model) throw new AiError('No model chosen. Pick one in Settings.', 400, ai.provider);
  const maxTokens = outputCap(req.maxTokens);
  let res: Response;
  let pick: (event: Record<string, unknown>) => string | undefined;

  if (ai.provider === 'google') {
    res = await post('google', `${BASE.google}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(ai.apiKey)}`, {}, {
      contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens, ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) },
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    });
    pick = (e) => {
      const parts = (e as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }).candidates?.[0]?.content?.parts;
      return parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
    };
  } else if (ai.provider === 'anthropic') {
    const body: Record<string, unknown> = {
      model, max_tokens: maxTokens, stream: true,
      messages: req.messages,
      ...(req.system ? { system: req.system } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };
    const headers = { 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01' };
    res = await post('anthropic', `${BASE.anthropic}/v1/messages`, headers, body);
    if (!res.ok && rejects(res.status, await res.clone().text(), /temperature/i)) {
      delete body.temperature;
      res = await post('anthropic', `${BASE.anthropic}/v1/messages`, headers, body);
    }
    pick = (e) => {
      const ev = e as { type?: string; delta?: { type?: string; text?: string } };
      return ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' ? ev.delta.text : undefined;
    };
  } else {
    const provider = ai.provider;
    const body: Record<string, unknown> = {
      model, stream: true,
      messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), ...req.messages],
      ...(provider === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };
    const url = `${BASE[provider]}/chat/completions`;
    res = await post(provider, url, chatHeaders(provider, ai.apiKey), body);
    if (!res.ok && rejects(res.status, await res.clone().text(), /temperature/i)) {
      delete body.temperature;
      res = await post(provider, url, chatHeaders(provider, ai.apiKey), body);
    }
    pick = (e) => (e as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
  }
  if (!res.ok) await fail(ai.provider, model, res);

  const encoder = new TextEncoder();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json || json === '[DONE]') continue;
            try {
              const text = pick(JSON.parse(json));
              if (text) controller.enqueue(encoder.encode(text));
            } catch { /* keep-alive or partial line */ }
          }
        }
      } catch (err) {
        console.error('[ai] stream read error:', err);
      } finally {
        controller.close();
      }
    },
  });
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

// ── model lists ────────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  name: string;
  /** USD per million tokens, when the provider publishes it (OpenRouter). */
  inputPrice?: number;
  outputPrice?: number;
  context?: number;
}

const NOT_TEXT = /(embed|tts|audio|realtime|transcri|whisper|dall-e|image|imagen|veo|aqa|moderation|search|computer-use|live|native-audio|babbage|davinci|robotics)/i;

/** The provider's current text models, fetched live with the user's key. */
export async function listModels(provider: Provider, apiKey: string): Promise<ModelInfo[]> {
  if (provider === 'google') {
    const res = await fetch(`${BASE.google}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) await fail(provider, 'models', res);
    const d = (await res.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }[] };
    return (d.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && !NOT_TEXT.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name, context: m.inputTokenLimit }));
  }
  if (provider === 'anthropic') {
    const res = await fetch(`${BASE.anthropic}/v1/models?limit=100`, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } });
    if (!res.ok) await fail(provider, 'models', res);
    const d = (await res.json()) as { data?: { id: string; display_name?: string }[] };
    return (d.data ?? []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  }
  if (provider === 'openai') {
    const res = await fetch(`${BASE.openai}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) await fail(provider, 'models', res);
    const d = (await res.json()) as { data?: { id: string; created?: number }[] };
    return (d.data ?? [])
      .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !NOT_TEXT.test(m.id) && !/instruct/.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ({ id: m.id, name: m.id }));
  }
  const res = await fetch(`${BASE.openrouter}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok) await fail(provider, 'models', res);
  const d = (await res.json()) as {
    data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { output_modalities?: string[] } }[];
  };
  return (d.data ?? [])
    .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text'))
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context: m.context_length,
      inputPrice: m.pricing?.prompt ? Number(m.pricing.prompt) * 1e6 : undefined,
      outputPrice: m.pricing?.completion ? Number(m.pricing.completion) * 1e6 : undefined,
    }))
    .filter((m) => !(m.inputPrice !== undefined && m.inputPrice < 0)); // "-1" marks router meta-models
}

/** A sensible default from a live list: the provider's default if offered, else a cheap general model. */
export function recommendModels(provider: Provider, models: ModelInfo[]): { model?: string; light?: string } {
  const ids = models.map((m) => m.id);
  const has = (id?: string) => (id && ids.includes(id) ? id : undefined);
  const first = (...res: RegExp[]) => res.map((re) => ids.find((id) => re.test(id))).find(Boolean);
  const info = PROVIDER_INFO[provider];
  if (provider === 'google') return { model: has(info.defaultModel) ?? first(/flash$/, /flash/), light: has(info.defaultLight) ?? first(/flash-lite$/, /flash-lite/) };
  if (provider === 'anthropic') return { model: has(info.defaultModel) ?? first(/haiku/, /sonnet/), light: has(info.defaultLight) ?? first(/haiku/) };
  if (provider === 'openai') return { model: first(/luna$/, /^gpt-\d(\.\d)?-mini$/, /mini$/), light: first(/luna$/, /nano$/, /mini$/) };
  // OpenRouter: the cheapest model from a major lab with a long context.
  const major = /^(anthropic|google|openai|deepseek|mistralai|meta-llama|qwen)\//;
  const cheap = models
    .filter((m) => major.test(m.id) && (m.context ?? 0) >= 100_000 && (m.inputPrice ?? 0) > 0 && !/:free$/.test(m.id))
    .sort((a, b) => (a.inputPrice ?? 0) + (a.outputPrice ?? 0) - ((b.inputPrice ?? 0) + (b.outputPrice ?? 0)));
  return { model: cheap[0]?.id, light: cheap[0]?.id };
}

/** Guesses the provider from a model id (for AI nodes saved with a model of their own). */
export function providerOfModel(model: string): Provider | null {
  if (model.includes('/')) return 'openrouter';
  if (/^claude-/.test(model)) return 'anthropic';
  if (/^(gpt-|o\d|chatgpt-)/.test(model)) return 'openai';
  if (/^gemini-/.test(model)) return 'google';
  return null;
}
