import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { CLOUD_FILE_FORMAT, CLOUD_FILE_VERSION, CLOUD_FILE_MIME, TYPE_TO_KIND, TYPE_ORDER, cloudFileName, type CloudFile, type CloudFileElement } from '@/lib/cloud-file';

/**
 * GET /api/v1/projects/<id>/cloud-file — the project's whole cloud as one .cloud.json file
 * (see src/lib/cloud-file.ts for the format). Everything on each item is kept: text, tags, quotes,
 * acts, associations, images (by address). Open it again with POST /api/v1/import/cloud-file.
 * ?download=0 returns it as plain JSON without the save-as header.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const { id } = await params;
  const project = (await query('SELECT id, title, description, cloud_slug, illustration_style FROM projects WHERE id = $1 AND user_id = $2', [id, userId])).rows[0] as
    | { id: string; title: string; description: string | null; cloud_slug: string | null; illustration_style: string | null } | undefined;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const rows = (await query(
    `SELECT cloud_type, title, content, tags, metadata FROM cloud_items
     WHERE user_id = $1 AND project_id = $2 AND cloud_type = ANY($3)
     ORDER BY array_position($3::text[], cloud_type), sort_order, created_at`,
    [userId, project.id, TYPE_ORDER]
  )).rows as { cloud_type: string; title: string; content: string | null; tags: string[] | null; metadata: Record<string, unknown> | null }[];
  if (!rows.length) return NextResponse.json({ error: 'This project has no cloud items yet.' }, { status: 400 });

  const elements: CloudFileElement[] = rows.map((r) => {
    const { image, image_url, tags: _t, ...rest } = (r.metadata ?? {}) as Record<string, unknown>;
    void _t;
    const img = image && typeof image === 'object' && typeof (image as { url?: unknown }).url === 'string'
      ? (image as CloudFileElement['image'])
      : typeof image_url === 'string' ? { url: image_url, alt: r.title } : undefined;
    const metadata = { ...rest, ...(r.tags?.length ? { tags: r.tags } : {}) };
    return { kind: TYPE_TO_KIND[r.cloud_type], title: r.title, text: r.content ?? '', ...(img ? { image: img } : {}), ...(Object.keys(metadata).length ? { metadata } : {}) };
  });

  const author = (await query('SELECT name, email FROM users WHERE id = $1', [userId])).rows[0] as { name?: string; email?: string } | undefined;
  const creator = author?.name || author?.email?.split('@')[0];
  const file: CloudFile = {
    format: CLOUD_FILE_FORMAT,
    version: CLOUD_FILE_VERSION,
    exported_at: new Date().toISOString(),
    generator: 'Context Cloud Studio',
    cloud: {
      title: project.title,
      ...(project.description ? { description: project.description } : {}),
      ...(creator ? { creator_name: creator } : {}),
      ...(project.cloud_slug ? { slug: project.cloud_slug, url: `${(process.env.CONTEXTUBE_URL ?? 'https://contextube.ai').replace(/\/$/, '')}/cloud/${project.cloud_slug}` } : {}),
      ...(project.illustration_style ? { illustration_style: project.illustration_style } : {}),
    },
    elements,
  };
  const download = req.nextUrl.searchParams.get('download') !== '0';
  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      'Content-Type': `${download ? CLOUD_FILE_MIME : 'application/json'}; charset=utf-8`,
      ...(download ? { 'Content-Disposition': `attachment; filename="${cloudFileName(project.title)}"` } : {}),
      'Cache-Control': 'no-store',
    },
  });
}
