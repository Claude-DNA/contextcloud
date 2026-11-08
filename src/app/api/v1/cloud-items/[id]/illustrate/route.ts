import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { illustrateItem, type Mode } from '@/lib/illustrate';
import { illustrationContext } from '@/lib/illustrate-route';
import { noImageKeyResponse, aiErrorResponse } from '@/lib/ai-key';

export const maxDuration = 120;

/**
 * POST /api/v1/cloud-items/<id>/illustrate { mode?: "auto" | "generate", style? }
 *   auto (default): a fitting public-domain artwork if one is found, otherwise a generated illustration.
 *   → { image: { url, alt, credit, source?, kind, image_id }, visual, reason? }
 * DELETE removes the item's picture (the file stays, in case it was published).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await illustrationContext(req, (await params).id);
  if (!ctx.ok) return ctx.res;
  const body = (await req.json().catch(() => ({}))) as { mode?: string; style?: string };
  const mode: Mode = body.mode === 'generate' ? 'generate' : 'auto';
  if (mode === 'generate' && !ctx.image) return noImageKeyResponse();
  try {
    const r = await illustrateItem({ ...ctx, style: body.style?.trim() || ctx.style, mode });
    return NextResponse.json({ image: r.image, visual: r.plan.visual, reason: r.reason });
  } catch (e) {
    if ((e as { code?: string }).code === 'IMAGE_KEY_REQUIRED') return noImageKeyResponse();
    return aiErrorResponse(e, 'Illustration failed');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await illustrationContext(req, (await params).id, { requireAi: false });
  if (!ctx.ok) return ctx.res;
  await query(`UPDATE cloud_items SET metadata = metadata - 'image', updated_at = NOW() WHERE id = $1`, [ctx.item.id]);
  return NextResponse.json({ removed: true });
}
