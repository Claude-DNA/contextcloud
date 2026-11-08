import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { getAiConfig, getImageConfig, noKeyResponse } from '@/lib/ai-key';
import { DEFAULT_STYLE, type Item } from '@/lib/illustrate';
import type { AiConfig } from '@/lib/ai';
import type { ImageConfig } from '@/lib/ai/images';

/** Shared setup for the illustration routes: the signed-in user, their item, project style and models. */
export async function illustrationContext(req: NextRequest, itemId: string): Promise<
  | { ok: false; res: Response }
  | { ok: true; userId: string; item: Item; ai: AiConfig; image: ImageConfig | null; style: string; work: string; origin: string }
> {
  const userId = await getAuthUserId(req);
  if (!userId) return { ok: false, res: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  if (!(await isDbAvailable())) return { ok: false, res: NextResponse.json({ error: 'Database not available' }, { status: 503 }) };
  await ensureSchema().catch(() => {});
  const r = await query(
    `SELECT i.id, i.user_id, i.project_id, i.cloud_type, i.title, i.content, i.metadata, p.title AS project_title, p.illustration_style
     FROM cloud_items i LEFT JOIN projects p ON p.id = i.project_id WHERE i.id = $1 AND i.user_id = $2`,
    [itemId, userId]
  );
  const row = r.rows[0];
  if (!row) return { ok: false, res: NextResponse.json({ error: 'Item not found' }, { status: 404 }) };
  const ai = await getAiConfig(userId);
  if (!ai) return { ok: false, res: noKeyResponse() };
  const image = await getImageConfig(userId);
  return {
    ok: true, userId, ai, image,
    item: row as Item,
    style: (row.illustration_style as string | null)?.trim() || DEFAULT_STYLE,
    work: (row.project_title as string | null) || 'Untitled',
    origin: req.nextUrl.origin,
  };
}
