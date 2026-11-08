import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { getImageConfig, noImageKeyResponse, aiErrorResponse } from '@/lib/ai-key';
import { generateImage } from '@/lib/ai/images';

export const maxDuration = 120;

/** Reference pictures may come only from these hosts (or this site's own /api/v1/images/<id>). */
const REF_HOSTS = ['contextcloud.studio', 'www.contextcloud.studio', 'contextube.ai', 'www.contextube.ai'];

/**
 * POST /api/v1/images/generate { prompt, references?: [url, …up to 3], label? }
 * Draws one picture with the user's image model and stores it.
 * → { image: { id, url, width, height, model } }
 * For agents illustrating things that are not Studio cloud items (a work's essences, a published cloud).
 * References keep a character or a style consistent; Google's image models use them, others ignore them.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});

  const body = (await req.json().catch(() => ({}))) as { prompt?: string; references?: unknown; label?: string };
  const prompt = (body.prompt ?? '').trim();
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ error: 'prompt must be 4000 characters or fewer' }, { status: 400 });

  const cfg = await getImageConfig(userId);
  if (!cfg) return noImageKeyResponse();

  const refUrls = Array.isArray(body.references) ? body.references.filter((u): u is string => typeof u === 'string').slice(0, 3) : [];
  const refs: { mimeType: string; data: string }[] = [];
  for (const u of refUrls) {
    let url: URL;
    try {
      url = new URL(u, req.nextUrl.origin);
    } catch {
      return NextResponse.json({ error: `Not a URL: ${u}` }, { status: 400 });
    }
    if (url.protocol !== 'https:' && url.origin !== req.nextUrl.origin) return NextResponse.json({ error: 'References must be https' }, { status: 400 });
    if (url.origin !== req.nextUrl.origin && !REF_HOSTS.includes(url.hostname)) {
      return NextResponse.json({ error: `References must be pictures on ${REF_HOSTS[0]} or ${REF_HOSTS[2]}` }, { status: 400 });
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!res?.ok) return NextResponse.json({ error: `Could not load reference ${u}` }, { status: 400 });
    const small = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 768, withoutEnlargement: true }).png().toBuffer();
    refs.push({ mimeType: 'image/png', data: small.toString('base64') });
  }

  try {
    const out = await generateImage(cfg, prompt, refs);
    const bytes = await sharp(out.bytes).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const meta = await sharp(bytes).metadata();
    const r = await query(
      `INSERT INTO images (user_id, kind, mime, bytes, width, height, prompt, model, credit)
       VALUES ($1, 'generated', 'image/webp', $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, bytes, meta.width ?? null, meta.height ?? null, prompt, cfg.model, body.label?.slice(0, 200) ?? null]
    );
    const id = r.rows[0].id as string;
    return NextResponse.json({ image: { id, url: `${req.nextUrl.origin}/api/v1/images/${id}`, width: meta.width, height: meta.height, model: cfg.model } });
  } catch (e) {
    return aiErrorResponse(e, 'Image generation failed');
  }
}
