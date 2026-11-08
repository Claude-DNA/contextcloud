import { NextRequest, NextResponse } from 'next/server';
import { usePublicDomain, type Candidate } from '@/lib/illustrate';
import { illustrationContext } from '@/lib/illustrate-route';

export const maxDuration = 60;

/** Only images from the open collections the search uses can be picked. */
const ALLOWED = /^https:\/\/(images\.metmuseum\.org|www\.artic\.edu\/iiif|images-assets\.nasa\.gov)\//;

/** POST /api/v1/cloud-items/<id>/illustrate/pick { candidate, alt? } → { image } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await illustrationContext(req, (await params).id);
  if (!ctx.ok) return ctx.res;
  const body = (await req.json().catch(() => ({}))) as { candidate?: Candidate; alt?: string };
  const c = body.candidate;
  const testing = Boolean(process.env.MET_API_BASE || process.env.AIC_API_BASE || process.env.NASA_API_BASE);
  if (!c?.full || !c.thumb || (!testing && (!ALLOWED.test(c.full) || !ALLOWED.test(c.thumb)))) {
    return NextResponse.json({ error: 'Choose one of the candidates from the search.' }, { status: 400 });
  }
  try {
    const image = await usePublicDomain(ctx.userId, ctx.item, c, body.alt ?? '', ctx.origin);
    return NextResponse.json({ image });
  } catch (e) {
    return NextResponse.json({ error: 'Could not fetch that picture', details: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
