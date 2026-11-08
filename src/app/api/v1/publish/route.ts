import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { passages, toFlowChunks, validateFlow, type FlowChunk, type FlowMeta } from '@/lib/flow';

/**
 * Publishes a flow to ConteXtube (POST {CONTEXTUBE_URL}/api/v1/publish).
 * ConteXtube needs a publish key: CONTEXTUBE_PUBLISH_KEY must match a `studio:<secret>` entry in its PUBLISH_KEYS.
 *
 * Body: { draftId?, title?, description?, tags?, chunks?, meta? }. Anything missing is read from the saved draft.
 * Chunks are ConteXtube layers (1–5); older drafts with free-form layer types are converted.
 */

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const publishKey = process.env.CONTEXTUBE_PUBLISH_KEY;
    if (!publishKey) {
      return NextResponse.json({ error: 'Publishing to ConteXtube is not set up on this server yet.' }, { status: 503 });
    }
    if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    await ensureSchema().catch(() => {});

    const body = await req.json();
    const draftId: string | undefined = body.draftId;
    let title: string | undefined = body.title;
    let description: string | undefined = body.description;
    let rawChunks: unknown = body.chunks ?? body.layers;
    let meta: FlowMeta = body.meta && typeof body.meta === 'object' ? body.meta : {};

    if (draftId && (!rawChunks || (Array.isArray(rawChunks) && rawChunks.length === 0) || !title)) {
      const d = await query(
        'SELECT title, description, layers_json, meta_json FROM cloud_drafts WHERE id = $1 AND user_id = $2',
        [draftId, userId]
      );
      const row = d.rows[0];
      if (!row) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
      title = title || row.title;
      description = description || row.description;
      if (!rawChunks || (Array.isArray(rawChunks) && rawChunks.length === 0)) rawChunks = row.layers_json;
      if (!body.meta) meta = row.meta_json ?? {};
    }

    const chunks: FlowChunk[] = toFlowChunks(rawChunks, () => crypto.randomUUID()).filter((c) => c.text.trim());

    // The source text as L5 passages, when the author chose it and the rights allow it.
    if (meta.include_source && meta.rights !== 'copyrighted' && !chunks.some((c) => c.layer === 5 && c.type === 'narrative')) {
      const scope = meta.project_id ? 'project_id = $2' : 'project_id IS NULL';
      const src = await query(
        `SELECT text FROM project_sources WHERE user_id = $1 AND ${scope} ORDER BY created_at`,
        meta.project_id ? [userId, meta.project_id] : [userId]
      );
      for (const row of src.rows) {
        for (const p of passages(row.text as string)) {
          chunks.push({ id: crypto.randomUUID(), layer: 5, type: 'narrative', text: p, importance: 0.2 });
        }
      }
    }

    const problems = validateFlow(title ?? '', chunks, meta);
    if (problems.length) {
      return NextResponse.json({ error: problems.map((p) => p.message).join(' '), problems }, { status: 400 });
    }

    const author = await query('SELECT name, email FROM users WHERE id = $1', [userId]);
    const authorName = (author.rows[0]?.name as string) || (author.rows[0]?.email as string)?.split('@')[0] || 'Context Cloud';

    const base = (process.env.CONTEXTUBE_URL ?? 'https://contextube.ai').replace(/\/$/, '');
    const tags: string[] = Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [];
    const tubeResponse = await fetch(`${base}/api/v1/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publishKey}` },
      body: JSON.stringify({
        flow: slugify(authorName) || 'context-cloud',
        flow_name: authorName,
        creator_name: authorName,
        title,
        description: description || '',
        language: 'en',
        rights: meta.rights ?? 'own',
        ...(meta.source_title ? { source_title: meta.source_title } : {}),
        ...(meta.source_author ? { source_author: meta.source_author } : {}),
        ...(meta.rights === 'copyrighted' && meta.purchase_url ? { purchase_url: meta.purchase_url } : {}),
        tags: tags.length ? tags : ['flow'],
        domains: [],
        chunks: chunks.map((c) => ({
          layer: c.layer,
          type: c.type,
          ...(c.extract ? { extract: c.extract } : {}),
          text: c.text.trim(),
          ...(c.source_quote ? { source_quote: c.source_quote } : {}),
          ...(c.links?.length ? { links: c.links } : {}),
          ...(typeof c.importance === 'number' ? { importance: c.importance } : {}),
          standalone: true,
          metadata: { source: 'contextcloud.studio' },
        })),
      }),
    });

    const tubeData = await tubeResponse.json().catch(() => ({}));
    if (!tubeResponse.ok) {
      const err = tubeData?.error;
      const details = Array.isArray(err?.details) ? ` (${err.details.map((d: { message: string }) => d.message).join('; ')})` : '';
      const message = (typeof err === 'string' ? err : err?.message) || 'Failed to publish to ConteXtube';
      return NextResponse.json({ error: message + details }, { status: tubeResponse.status });
    }

    if (draftId) {
      await query(
        `UPDATE cloud_drafts SET status = 'published', tube_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
        [tubeData.content?.slug || tubeData.content?.id || null, draftId, userId]
      );
    }

    return NextResponse.json({
      success: true,
      published: {
        id: tubeData.content?.id,
        slug: tubeData.content?.slug,
        url: `${base}/content/${tubeData.content?.slug}`,
        chunks: chunks.length,
      },
    });
  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
