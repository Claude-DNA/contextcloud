import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { rowToIdea, titleFrom, IDEA_COLUMNS, type IdeaRow } from '@/lib/ideas-adapter';

/** Ideas are cloud items of type 'ideas'. ?project_id=<id> limits to one project; without it, all of the user's ideas. */
function scope(projectId: string | null) {
  if (projectId === 'unassigned') return { sql: ' AND project_id IS NULL', params: [] as string[] };
  if (projectId) return { sql: ' AND project_id = $2', params: [projectId] };
  return { sql: '', params: [] as string[] };
}

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ ideas: [] });
  await ensureSchema().catch(() => {});
  const s = scope(req.nextUrl.searchParams.get('project_id'));
  const res = await query(
    `SELECT ${IDEA_COLUMNS} FROM cloud_items WHERE user_id = $1 AND cloud_type = 'ideas'${s.sql} ORDER BY sort_order ASC, created_at ASC`,
    [userId, ...s.params]
  );
  return NextResponse.json({ ideas: (res.rows as IdeaRow[]).map(rowToIdea) });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});

  const { text, weight, image_url, project_id } = await req.json();
  if (!text || typeof text !== 'string') return NextResponse.json({ error: 'Text is required' }, { status: 400 });

  let projectId: string | null = null;
  if (project_id && project_id !== 'unassigned') {
    const owns = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [project_id, userId]);
    if (!owns.rows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    projectId = project_id;
  }

  // New ideas go to the top: shift the others down.
  await query(
    `UPDATE cloud_items SET sort_order = sort_order + 1 WHERE user_id = $1 AND cloud_type = 'ideas' AND project_id IS NOT DISTINCT FROM $2::uuid`,
    [userId, projectId]
  );
  const res = await query(
    `INSERT INTO cloud_items (user_id, project_id, cloud_type, title, content, metadata, sort_order)
     VALUES ($1, $2, 'ideas', $3, $4, $5, 0) RETURNING ${IDEA_COLUMNS}`,
    [userId, projectId, titleFrom(text), text, JSON.stringify({ weight: typeof weight === 'number' ? weight : 1, image_url: image_url || null, locked: false })]
  );
  return NextResponse.json({ idea: rowToIdea(res.rows[0] as IdeaRow) }, { status: 201 });
}

// DELETE ?all=true[&project_id=] — clears the user's ideas (in one project when given)
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  if (req.nextUrl.searchParams.get('all') !== 'true') return NextResponse.json({ error: 'Use ?all=true' }, { status: 400 });
  const s = scope(req.nextUrl.searchParams.get('project_id'));
  const res = await query(`DELETE FROM cloud_items WHERE user_id = $1 AND cloud_type = 'ideas'${s.sql}`, [userId, ...s.params]);
  return NextResponse.json({ deleted: res.rowCount });
}
