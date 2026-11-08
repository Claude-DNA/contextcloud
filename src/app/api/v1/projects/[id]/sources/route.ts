import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';

const MAX_SOURCE_CHARS = 1_000_000;

async function owned(projectId: string, userId: string) {
  const r = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
  return r.rows.length > 0;
}

/**
 * The texts a project's clouds were built from. Upload stores them automatically; agents that read
 * a work themselves and save items through /cloud-items/batch store the text here. Flow drafts check
 * their quotes against these texts, and publishing can include them as L5 full narrative.
 *
 * GET  → { sources: [{ id, filename, chars, created_at }] }
 * POST { filename, text } → { id, stored: true } or { stored: false, duplicate_of } (same text, ignoring whitespace)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const { id } = await params;
  if (!(await owned(id, userId))) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const r = await query(
    'SELECT id, filename, length(text) AS chars, created_at FROM project_sources WHERE project_id = $1 AND user_id = $2 ORDER BY created_at',
    [id, userId]
  );
  return NextResponse.json({ sources: r.rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const { id } = await params;
  if (!(await owned(id, userId))) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { filename?: string; text?: string };
  const text = (body.text ?? '').trim();
  if (text.length < 20) return NextResponse.json({ error: 'text is required (at least 20 characters)' }, { status: 400 });
  if (text.length > MAX_SOURCE_CHARS) return NextResponse.json({ error: `text is longer than ${MAX_SOURCE_CHARS} characters` }, { status: 413 });
  const filename = (body.filename ?? 'source.txt').toString().slice(0, 200);

  const dup = await query(
    `SELECT id FROM project_sources
     WHERE user_id = $1 AND project_id = $2
       AND md5(btrim(regexp_replace(text, '\\s+', ' ', 'g'))) = md5(btrim(regexp_replace($3, '\\s+', ' ', 'g')))
     LIMIT 1`,
    [userId, id, text]
  );
  if (dup.rows.length) return NextResponse.json({ stored: false, duplicate_of: dup.rows[0].id });

  const r = await query(
    'INSERT INTO project_sources (user_id, project_id, filename, text) VALUES ($1, $2, $3, $4) RETURNING id',
    [userId, id, filename, text]
  );
  return NextResponse.json({ id: r.rows[0].id, stored: true }, { status: 201 });
}
