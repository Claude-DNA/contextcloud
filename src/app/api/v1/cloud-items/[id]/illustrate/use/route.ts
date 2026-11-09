import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { illustrationContext } from '@/lib/illustrate-route';

/**
 * POST /api/v1/cloud-items/<id>/illustrate/use { image_id, alt? } → { image }
 * Puts one of your own stored pictures (for example from POST /api/v1/images/generate) on this item.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await illustrationContext(req, (await params).id, { requireAi: false });
  if (!ctx.ok) return ctx.res;
  const body = (await req.json().catch(() => ({}))) as { image_id?: string; alt?: string };
  if (!body.image_id || !/^[0-9a-f-]{36}$/i.test(body.image_id)) return NextResponse.json({ error: 'image_id is required' }, { status: 400 });
  const r = await query(`SELECT id, kind, model, credit, source_url FROM images WHERE id = $1 AND user_id = $2`, [body.image_id, ctx.userId]);
  const row = r.rows[0];
  if (!row) return NextResponse.json({ error: 'Picture not found' }, { status: 404 });
  const credit = row.kind === 'generated'
    ? `Illustration made with ${row.model || 'an image model'} for Context Cloud Studio.`
    : (row.credit as string | null) || '';
  const image = {
    url: `${ctx.origin}/api/v1/images/${row.id}`,
    alt: (body.alt ?? '').trim().slice(0, 300) || ctx.item.title,
    credit,
    ...(row.source_url ? { source: row.source_url } : {}),
    kind: row.kind,
    image_id: row.id,
  };
  await query(`UPDATE images SET item_id = $1, project_id = $2 WHERE id = $3 AND item_id IS NULL`, [ctx.item.id, ctx.item.project_id, row.id]);
  await query(
    `UPDATE cloud_items SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('image', $1::jsonb), updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(image), ctx.item.id]
  );
  return NextResponse.json({ image });
}
