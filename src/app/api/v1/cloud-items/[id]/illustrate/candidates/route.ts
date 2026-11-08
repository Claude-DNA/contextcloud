import { NextRequest, NextResponse } from 'next/server';
import { planIllustration, searchPublicDomain } from '@/lib/illustrate';
import { illustrationContext } from '@/lib/illustrate-route';
import { aiErrorResponse } from '@/lib/ai-key';

export const maxDuration = 60;

/**
 * POST /api/v1/cloud-items/<id>/illustrate/candidates { queries? }
 *   → { visual, queries, candidates: [{ id, source, title, creator, date, thumb, full, page, credit }] }
 * Public-domain artworks for the author to choose from (then POST …/illustrate/pick).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await illustrationContext(req, (await params).id);
  if (!ctx.ok) return ctx.res;
  const body = (await req.json().catch(() => ({}))) as { queries?: string[] };
  try {
    const own = Array.isArray(body.queries) ? body.queries.map(String).filter(Boolean).slice(0, 3) : [];
    const plan = own.length ? { visual: ctx.item.title, queries: own } : await planIllustration(ctx.ai, ctx.item, { work: ctx.work, style: ctx.style });
    const candidates = await searchPublicDomain(plan.queries, 12);
    return NextResponse.json({ visual: plan.visual, queries: plan.queries, candidates });
  } catch (e) {
    return aiErrorResponse(e, 'Search failed');
  }
}
