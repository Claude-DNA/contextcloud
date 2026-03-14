import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';

const CLOUD_TYPE_TO_NODE: Record<string, string> = {
  characters: 'character',
  scenes: 'scene',
  world: 'world',
  ideas: 'theme',
  arc: 'chapterAct',
};

const REF_TYPE_MAP: Record<string, string> = {
  music: 'musicReference',
  film: 'filmReference',
  book: 'bookReference',
  art: 'artReference',
  'real event': 'realEventReference',
};

function mapCloudTypeToNodeType(cloudType: string, metadata?: Record<string, unknown>): string {
  if (cloudType === 'references') {
    const refType = (metadata?.refType as string || '').toLowerCase();
    return REF_TYPE_MAP[refType] || 'bookReference';
  }
  return CLOUD_TYPE_TO_NODE[cloudType] || 'theme';
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  await runMigrations();

  const projectId = req.nextUrl.searchParams.get('project_id');
  let sql = 'SELECT * FROM cloud_items WHERE user_id = $1';
  const params: unknown[] = [session.user.id];

  if (projectId === 'unassigned') {
    sql += ' AND project_id IS NULL';
  } else if (projectId) {
    sql += ' AND project_id = $2';
    params.push(projectId);
  }

  sql += ' ORDER BY cloud_type, sort_order ASC, created_at ASC';
  const res = await query(sql, params);

  const items = res.rows;

  // Group by cloud_type for column positioning
  const byType = new Map<string, typeof items>();
  for (const item of items) {
    const list = byType.get(item.cloud_type) || [];
    list.push(item);
    byType.set(item.cloud_type, list);
  }

  const nodes: Array<{
    id: string;
    type: string;
    cloud_type: string;
    title: string;
    content: string;
    position: { x: number; y: number };
  }> = [];

  let colIndex = 0;
  for (const [cloudType, typeItems] of byType) {
    const x = 80 + colIndex * 380;
    typeItems.forEach((item, rowIndex) => {
      const metadata = typeof item.metadata === 'string'
        ? JSON.parse(item.metadata || '{}')
        : (item.metadata || {});
      nodes.push({
        id: `cloud_${item.id}`,
        type: mapCloudTypeToNodeType(cloudType, metadata),
        cloud_type: cloudType,
        title: item.title,
        content: item.content || '',
        position: { x, y: 80 + rowIndex * 220 },
      });
    });
    colIndex++;
  }

  return NextResponse.json({ nodes, edges: [] });
}
