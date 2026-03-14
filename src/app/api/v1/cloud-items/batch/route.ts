import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

const VALID_TYPES = ['characters', 'references', 'scenes', 'world', 'ideas', 'arc'] as const;
type CloudType = typeof VALID_TYPES[number];

interface BatchItem {
  cloud_type: string;
  title: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// POST /api/v1/cloud-items/batch
// Body: { items: BatchItem[] }
// Saves all items in a single transaction — avoids N parallel DB connections.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await runMigrations();

  const body = await req.json();
  const { items, source, project_id } = body as { items: BatchItem[]; source?: 'chat' | 'file' | 'direct' | 'voice'; project_id?: string };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array required' }, { status: 400 });
  }

  // Validate all items upfront
  const validated: { cloud_type: CloudType; title: string; content: string; tags: string[]; metadata: string }[] = [];
  const invalid: string[] = [];

  for (const item of items) {
    if (!item.cloud_type || !VALID_TYPES.includes(item.cloud_type as CloudType)) {
      invalid.push(`"${item.title}" — invalid type: ${item.cloud_type}`);
      continue;
    }
    if (!item.title?.trim()) {
      invalid.push(`item with type ${item.cloud_type} — missing title`);
      continue;
    }
    const meta = { ...(item.metadata || {}), ...(source ? { source } : {}) };
    validated.push({
      cloud_type: item.cloud_type as CloudType,
      title: item.title.trim(),
      content: item.content || '',
      tags: item.tags || [],
      metadata: JSON.stringify(meta),
    });
  }

  if (validated.length === 0) {
    return NextResponse.json({ error: 'No valid items', invalid }, { status: 400 });
  }

  // Get current max sort_order per type in one query
  const typeList = [...new Set(validated.map(v => v.cloud_type))];
  const maxRes = await query(
    `SELECT cloud_type, COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM cloud_items
     WHERE user_id = $1 AND cloud_type = ANY($2)
     GROUP BY cloud_type`,
    [session.user.id, typeList]
  );
  const nextOrderMap: Record<string, number> = {};
  for (const row of maxRes.rows) {
    nextOrderMap[row.cloud_type] = parseInt(row.next_order, 10);
  }
  const typeCounters: Record<string, number> = {};

  // Build bulk insert using a single parameterised query
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 1;

  for (const item of validated) {
    const base = nextOrderMap[item.cloud_type] ?? 0;
    const offset = typeCounters[item.cloud_type] ?? 0;
    typeCounters[item.cloud_type] = offset + 1;
    const sortOrder = base + offset;

    placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    values.push(session.user.id, item.cloud_type, item.title, item.content, item.tags, item.metadata, sortOrder, project_id || null);
  }

  const insertSQL = `
    INSERT INTO cloud_items (user_id, cloud_type, title, content, tags, metadata, sort_order, project_id)
    VALUES ${placeholders.join(', ')}
    RETURNING id, cloud_type, title
  `;

  const result = await query(insertSQL, values);

  return NextResponse.json(
    { saved: result.rows, count: result.rowCount, invalid },
    { status: 201 }
  );
}
