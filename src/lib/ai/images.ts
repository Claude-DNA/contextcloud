/**
 * Image generation with the user's own key: Google (Gemini image models), OpenAI (GPT Image) or
 * OpenRouter (its /images endpoint). Anthropic has no image models, so illustrations have their own
 * provider setting. Every call returns the image bytes; storage is the caller's job.
 */
import { BASE } from './index';

export type ImageProvider = 'google' | 'openai' | 'openrouter';
export const IMAGE_PROVIDERS: ImageProvider[] = ['google', 'openai', 'openrouter'];

/** Defaults when the user hasn't picked a model; checked against the provider's live list in Settings. */
export const IMAGE_DEFAULTS: Record<ImageProvider, string | undefined> = {
  google: 'gemini-3.1-flash-image-preview',
  openai: 'gpt-image-2',
  openrouter: undefined,
};

export interface ImageConfig {
  provider: ImageProvider;
  apiKey: string;
  model: string;
}

export interface GeneratedImage {
  bytes: Buffer;
  mime: string;
}

export class ImageError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Landscape 3:2 suits the cloud cards. */
const ASPECT = '3:2';

async function post(url: string, headers: Record<string, string>, body: unknown) {
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (res.ok || (res.status !== 429 && res.status < 500)) return res;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return res!;
}

async function fail(cfg: ImageConfig, res: Response): Promise<never> {
  throw new ImageError(`${cfg.provider} image model ${cfg.model} error ${res.status}: ${(await res.text()).slice(0, 500)}`, res.status);
}

/**
 * Generates one illustration. `references` are images the model should keep consistent with
 * (a character's portrait, say); only Google's models take them, the others get the prompt alone.
 */
export async function generateImage(cfg: ImageConfig, prompt: string, references: { mimeType: string; data: string }[] = []): Promise<GeneratedImage> {
  if (cfg.provider === 'google') {
    const url = `${BASE.google}/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const body = (withConfig: boolean) => ({
      contents: [{ role: 'user', parts: [...references.map((r) => ({ inlineData: r })), { text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], ...(withConfig ? { imageConfig: { aspectRatio: ASPECT } } : {}) },
    });
    let res = await post(url, {}, body(true));
    if (!res.ok && res.status === 400 && /imageConfig|aspect/i.test(await res.clone().text())) res = await post(url, {}, body(false));
    if (!res.ok) await fail(cfg, res);
    const data = await res.json();
    const parts = (data?.candidates?.[0]?.content?.parts ?? []) as { inlineData?: { mimeType: string; data: string } }[];
    const img = parts.find((p) => p.inlineData?.data)?.inlineData;
    if (!img) throw new ImageError(`${cfg.model} returned no image${data?.candidates?.[0]?.finishReason ? ` (${data.candidates[0].finishReason})` : ''}`, 502);
    return { bytes: Buffer.from(img.data, 'base64'), mime: img.mimeType || 'image/png' };
  }

  if (cfg.provider === 'openai') {
    const url = `${BASE.openai}/images/generations`;
    const headers = { Authorization: `Bearer ${cfg.apiKey}` };
    const body: Record<string, unknown> = { model: cfg.model, prompt, size: '1536x1024', quality: 'medium', n: 1 };
    let res = await post(url, headers, body);
    if (!res.ok && res.status === 400 && /quality|size/i.test(await res.clone().text())) {
      delete body.quality;
      body.size = '1024x1024';
      res = await post(url, headers, body);
    }
    if (!res.ok) await fail(cfg, res);
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new ImageError(`${cfg.model} returned no image`, 502);
    return { bytes: Buffer.from(b64, 'base64'), mime: 'image/png' };
  }

  // OpenRouter: the dedicated images endpoint; older routers answer image models on chat completions.
  const headers = { Authorization: `Bearer ${cfg.apiKey}`, 'HTTP-Referer': 'https://contextcloud.studio', 'X-Title': 'Context Cloud Studio' };
  let res = await post(`${BASE.openrouter}/images`, headers, { model: cfg.model, prompt, aspect_ratio: ASPECT, resolution: '1K' });
  if (res.ok) {
    const data = await res.json();
    const item = data?.data?.[0];
    if (item?.b64_json) return { bytes: Buffer.from(item.b64_json, 'base64'), mime: item.media_type || 'image/png' };
  } else if (res.status !== 404 && res.status !== 405) {
    await fail(cfg, res);
  }
  res = await post(`${BASE.openrouter}/chat/completions`, headers, {
    model: cfg.model,
    modalities: ['image', 'text'],
    image_config: { aspect_ratio: ASPECT },
    messages: [{ role: 'user', content: prompt }],
  });
  if (!res.ok) await fail(cfg, res);
  const data = await res.json();
  const dataUrl: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new ImageError(`${cfg.model} returned no image`, 502);
  return { bytes: Buffer.from(m[2], 'base64'), mime: m[1] };
}

export interface ImageModelInfo { id: string; name: string; price?: string }

/** The provider's current image models, fetched live with the user's key. */
export async function listImageModels(provider: ImageProvider, apiKey: string): Promise<ImageModelInfo[]> {
  if (provider === 'google') {
    const res = await fetch(`${BASE.google}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) throw new ImageError(`Google models error ${res.status}`, res.status);
    const d = (await res.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
    return (d.models ?? [])
      .filter((m) => /image/i.test(m.name) && m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }));
  }
  if (provider === 'openai') {
    const res = await fetch(`${BASE.openai}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new ImageError(`OpenAI models error ${res.status}`, res.status);
    const d = (await res.json()) as { data?: { id: string; created?: number }[] };
    return (d.data ?? [])
      .filter((m) => /^gpt-image/.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ({ id: m.id, name: m.id }));
  }
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
  let res = await fetch(`${BASE.openrouter}/images/models`, { headers });
  if (!res.ok) res = await fetch(`${BASE.openrouter}/models?output_modalities=image`, { headers });
  if (!res.ok) throw new ImageError(`OpenRouter models error ${res.status}`, res.status);
  const d = (await res.json()) as { data?: { id: string; name?: string; pricing?: Record<string, string> }[] };
  return (d.data ?? []).map((m) => {
    const per = m.pricing?.image ?? m.pricing?.per_image;
    return { id: m.id, name: m.name || m.id, ...(per ? { price: `$${Number(per).toFixed(3)} per image` } : {}) };
  });
}
