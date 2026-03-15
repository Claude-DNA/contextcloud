import { NextResponse , NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

// POST /api/v1/arc-scenes/migrate-legacy
// One-time migration: copies arcs/chapters from legacy tables → cloud_items (cloud_type='arc')
// Idempotent — skips items already migrated (matched by title)
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await runMigrations();
  const _localUserId = userId;

  // 1. Fetch all arcs for this user
  const arcsRes = await query(
    'SELECT id, name, description FROM arcs WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );

  if (arcsRes.rows.length === 0) {
    return NextResponse.json({ migrated: 0, message: 'No legacy arc data found' });
  }

  let migratedCount = 0;
  const migratedItems: string[] = [];

  // 2. For each arc, fetch its chapters and import as cloud_items
  for (const arc of arcsRes.rows) {
    const chaptersRes = await query(
      'SELECT c.id, c.name, c.sort_order FROM chapters c WHERE c.arc_id = $1 ORDER BY c.sort_order ASC, c.created_at ASC',
      [arc.id]
    );

    for (const chapter of chaptersRes.rows) {
      // Fetch plots for this chapter to build content
      const plotsRes = await query(
        'SELECT name, content FROM plots WHERE chapter_id = $1 ORDER BY sort_order ASC, created_at ASC',
        [chapter.id]
      );

      const plotText = plotsRes.rows
        .map((p: { name: string; content: string | null }) =>
          p.content ? `${p.name}: ${p.content}` : p.name
        )
        .join('\n\n');

      const sceneTitle = arc.name !== chapter.name
        ? `${arc.name} — ${chapter.name}`
        : chapter.name;

      const content = [arc.description, plotText].filter(Boolean).join('\n\n');

      // Idempotent: check if this title already exists as an arc cloud_item for this user
      const existing = await query(
        `SELECT id FROM cloud_items WHERE user_id = $1 AND cloud_type = 'arc' AND title = $2`,
        [userId, sceneTitle]
      );
      if (existing.rows.length > 0) continue;

      await query(
        `INSERT INTO cloud_items (user_id, cloud_type, title, content, tags, metadata, sort_order)
         VALUES ($1, 'arc', $2, $3, '{}', '{}', $4)`,
        [userId, sceneTitle, content || '', chapter.sort_order]
      );
      migratedCount++;
      migratedItems.push(sceneTitle);
    }
  }

  return NextResponse.json({
    migrated: migratedCount,
    items: migratedItems,
    message: migratedCount > 0
      ? `Migrated ${migratedCount} scene${migratedCount > 1 ? 's' : ''} from your legacy Arc Cloud`
      : 'All legacy scenes already migrated',
  });
}

// GET /api/v1/arc-scenes/migrate-legacy
// Check if legacy data exists (for showing migration banner)
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ hasLegacy: false });
  }

  const res = await query(
    'SELECT COUNT(*) as count FROM arcs WHERE user_id = $1',
    [userId]
  );

  const count = parseInt(res.rows[0]?.count || '0', 10);
  return NextResponse.json({ hasLegacy: count > 0, arcCount: count });
}
