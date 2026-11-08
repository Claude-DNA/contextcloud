import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';

/**
 * Publishes a project's cloud to ConteXtube as a page at contextube.ai/cloud/<slug>
 * (POST {CONTEXTUBE_URL}/api/v1/clouds, with CONTEXTUBE_PUBLISH_KEY as the "studio" writer).
 *
 * POST { project_id, title?, description?, genre?, rights?, source_title?, source_author?, purchase_url?,
 *        work?, cover?, slug?, dry_run? }   slug applies to the first publish only; later ones keep the page's address.
 *   → { published: { slug, url, element_count } }   (dry_run: { preview: <the payload> })
 *
 * Elements come from the project's cloud items, in their order: arc → plot, characters, scenes → stage,
 * world → universe, ideas, references. An item's image is metadata.image ({ url, alt, credit, source })
 * or metadata.image_url. The cloud is published as this user's (owner studio:<user id>), so no other
 * Studio user can replace it; publishing the same project again updates the same page.
 */

const KIND: Record<string, string> = { arc: 'plot', characters: 'characters', scenes: 'stage', world: 'universe', ideas: 'ideas', references: 'references' };
const ORDER = ['arc', 'characters', 'scenes', 'world', 'ideas', 'references'];
const META_KEYS = ['source_quote', 'aliases', 'initial_state', 'act', 'act_number', 'beat_number', 'when'] as const;

function slugify(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

type Img = { url: string; alt?: string; credit?: string; source?: string };
function imageOf(m: Record<string, unknown>, title: string): Img | undefined {
  const img = m.image as Img | undefined;
  if (img && typeof img === 'object' && typeof img.url === 'string' && /^(https?:\/\/|\/)/.test(img.url)) return { alt: title, ...img };
  if (typeof m.image_url === 'string' && /^https?:\/\//.test(m.image_url)) return { url: m.image_url, alt: title };
  return undefined;
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});

  const body = (await req.json().catch(() => ({}))) as {
    project_id?: string; title?: string; description?: string; genre?: string; rights?: string;
    source_title?: string; source_author?: string; purchase_url?: string; work?: string; cover?: Img; slug?: string; dry_run?: boolean;
  };
  if (!body.project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  const proj = await query('SELECT id, title, description, cloud_slug FROM projects WHERE id = $1 AND user_id = $2', [body.project_id, userId]);
  const project = proj.rows[0] as { id: string; title: string; description: string | null; cloud_slug: string | null } | undefined;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const rows = (await query(
    `SELECT cloud_type, title, content, tags, metadata FROM cloud_items
     WHERE user_id = $1 AND project_id = $2 AND cloud_type = ANY($3)
     ORDER BY array_position($3::text[], cloud_type), sort_order, created_at`,
    [userId, project.id, ORDER]
  )).rows as { cloud_type: string; title: string; content: string | null; tags: string[] | null; metadata: Record<string, unknown> | null }[];
  if (!rows.length) return NextResponse.json({ error: 'This project has no cloud items yet.' }, { status: 400 });

  const elements = rows.map((r) => {
    const m = r.metadata ?? {};
    const metadata: Record<string, unknown> = {};
    for (const k of META_KEYS) if (m[k] !== undefined && m[k] !== null && m[k] !== '') metadata[k] = m[k];
    if (r.tags?.length) metadata.tags = r.tags;
    const image = imageOf(m, r.title);
    return { kind: KIND[r.cloud_type], title: r.title.slice(0, 200), text: (r.content ?? '').slice(0, 6000), ...(image ? { image } : {}), metadata };
  });

  const author = await query('SELECT name, email FROM users WHERE id = $1', [userId]);
  const authorName = (author.rows[0]?.name as string) || (author.rows[0]?.email as string)?.split('@')[0] || 'Context Cloud';
  const title = (body.title ?? project.title ?? 'Untitled').trim().slice(0, 200);
  const rights = ['own', 'public_domain', 'copyrighted'].includes(body.rights ?? '') ? body.rights! : 'own';
  const payload = {
    slug: project.cloud_slug || (body.slug && /^[a-z0-9-]{1,80}$/.test(body.slug) ? body.slug : slugify(title)) || undefined,
    title,
    description: (body.description ?? project.description ?? '').trim().slice(0, 1000),
    ...(body.genre?.trim() ? { genre: body.genre.trim().slice(0, 60) } : {}),
    creator_name: authorName,
    flow: slugify(authorName) || 'context-cloud',
    flow_name: authorName,
    ...(body.work && /^[a-z0-9-]+$/.test(body.work) ? { work: body.work } : {}),
    rights,
    ...(body.source_title ? { source_title: body.source_title } : {}),
    ...(body.source_author ? { source_author: body.source_author } : {}),
    ...(rights === 'copyrighted' && body.purchase_url ? { purchase_url: body.purchase_url } : {}),
    ...(body.cover?.url ? { cover: body.cover } : {}),
    owner: `studio:${userId}`,
    elements,
  };
  if (body.dry_run) return NextResponse.json({ preview: payload });

  const publishKey = process.env.CONTEXTUBE_PUBLISH_KEY;
  if (!publishKey) return NextResponse.json({ error: 'Publishing is not set up on this server (CONTEXTUBE_PUBLISH_KEY).' }, { status: 503 });
  const base = (process.env.CONTEXTUBE_URL ?? 'https://contextube.ai').replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/clouds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publishKey}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error;
    const details = Array.isArray(err?.details) ? ` (${err.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join('; ')})` : '';
    const message = res.status === 409
      ? 'A cloud with this title already belongs to someone else on ConteXtube. Change the title and publish again.'
      : ((typeof err === 'string' ? err : err?.message) || 'Publishing to ConteXtube failed') + details;
    return NextResponse.json({ error: message }, { status: res.status === 409 ? 409 : 502 });
  }

  await query('UPDATE projects SET cloud_slug = $1, cloud_published_at = NOW() WHERE id = $2', [data.cloud.slug, project.id]);
  return NextResponse.json({ published: { slug: data.cloud.slug, url: data.cloud.url, element_count: data.element_count, created: data.created } });
}
