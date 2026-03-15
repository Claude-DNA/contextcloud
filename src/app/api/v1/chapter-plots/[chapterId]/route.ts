import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!(await isDbAvailable())) {
    return NextResponse.json({ chapter: null, plots: [] });
  }

  const { chapterId } = await params;

  // Get chapter (verify it belongs to user via arc)
  const chapRes = await query(
    `SELECT c.*, a.name as arc_name FROM chapters c
     JOIN arcs a ON a.id = c.arc_id
     WHERE c.id = $1 AND a.user_id = $2`,
    [chapterId, userId]
  );
  if (chapRes.rows.length === 0) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }
  const chapter = chapRes.rows[0] as Record<string, unknown>;

  // Get plots for this chapter
  const plotsRes = await query(
    `SELECT p.*, (SELECT COUNT(*) FROM plot_alternatives WHERE plot_id = p.id) as alternatives_count
     FROM plots p WHERE p.chapter_id = $1
     ORDER BY p.sort_order ASC, p.created_at ASC`,
    [chapterId]
  );

  return NextResponse.json({ chapter, plots: plotsRes.rows });
}
