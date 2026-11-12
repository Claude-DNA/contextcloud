import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { parseCloudFile, KIND_TO_TYPE } from '@/lib/cloud-file';

/**
 * POST /api/v1/import/cloud-file — opens a .cloud.json file (the body is the file itself) as a new
 * project, with every element, quote, tag, association and image address it holds. No AI is used.
 * ?project_id=<id> adds the elements to that project instead of making a new one.
 * → { project: { id, title, created }, imported: <count> }
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});

  let raw: unknown;
  try {
    raw = JSON.parse((await req.text()).replace(/^﻿/, ''));
  } catch {
    return NextResponse.json({ error: 'This file is not valid JSON, so it is not a cloud file.' }, { status: 400 });
  }
  const parsed = parseCloudFile(raw);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { cloud, elements } = parsed.file;

  const into = req.nextUrl.searchParams.get('project_id');
  let project: { id: string; title: string };
  let created = false;
  if (into) {
    const own = (await query('SELECT id, title FROM projects WHERE id = $1 AND user_id = $2', [into, userId])).rows[0] as { id: string; title: string } | undefined;
    if (!own) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    project = own;
  } else {
    project = (await query(
      'INSERT INTO projects (user_id, title, description, illustration_style) VALUES ($1, $2, $3, $4) RETURNING id, title',
      [userId, cloud.title, cloud.description ?? '', cloud.illustration_style ?? null]
    )).rows[0] as { id: string; title: string };
    created = true;
  }

  // Each kind keeps the file's order, after anything the project already has.
  const next: Record<string, number> = {};
  for (const r of (await query(
    'SELECT cloud_type, COALESCE(MAX(sort_order), -1) + 1 AS n FROM cloud_items WHERE user_id = $1 AND project_id = $2 GROUP BY cloud_type',
    [userId, project.id]
  )).rows as { cloud_type: string; n: number }[]) next[r.cloud_type] = Number(r.n);

  const CHUNK = 100;
  let imported = 0;
  for (let at = 0; at < elements.length; at += CHUNK) {
    const values: unknown[] = [];
    const rows = elements.slice(at, at + CHUNK).map((e, i) => {
      const type = KIND_TO_TYPE[e.kind];
      const order = next[type] ?? 0;
      next[type] = order + 1;
      const { tags, ...meta } = (e.metadata ?? {}) as Record<string, unknown>;
      const tagList = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 60)).slice(0, 20) : [];
      values.push(userId, project.id, type, e.title, e.text, tagList, JSON.stringify({ ...meta, ...(e.image ? { image: e.image } : {}) }), order);
      const b = i * 8;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}::jsonb, $${b + 8}, 'cloud_file')`;
    });
    const r = await query(
      `INSERT INTO cloud_items (user_id, project_id, cloud_type, title, content, tags, metadata, sort_order, source_type) VALUES ${rows.join(', ')}`,
      values
    );
    imported += r.rowCount ?? rows.length;
  }
  return NextResponse.json({ project: { ...project, created }, imported });
}
