/**
 * Character State Engine — database access. Reads characters and arc scenes; writes only inside
 * metadata.engine (merged, never replacing the rest of the metadata) and projects.engine.
 */
import { query } from '@/lib/db';
import type { EngineItem } from './story';

export async function loadProjectItems(userId: string, projectId: string | null): Promise<EngineItem[]> {
  const scope = projectId ? 'project_id = $2' : 'project_id IS NULL';
  const res = await query(
    `SELECT id, cloud_type, title, content, metadata FROM cloud_items
     WHERE user_id = $1 AND ${scope} AND cloud_type IN ('characters', 'arc')
     ORDER BY cloud_type, sort_order, created_at`,
    projectId ? [userId, projectId] : [userId]
  );
  return res.rows as EngineItem[];
}

export async function loadSettings(userId: string, projectId: string | null): Promise<Record<string, unknown>> {
  if (!projectId) return {};
  const res = await query('SELECT engine FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
  return (res.rows[0]?.engine as Record<string, unknown>) ?? {};
}

export async function saveSettings(userId: string, projectId: string, settings: Record<string, unknown>): Promise<boolean> {
  const res = await query('UPDATE projects SET engine = $1::jsonb, updated_at = NOW() WHERE id = $2 AND user_id = $3', [JSON.stringify(settings), projectId, userId]);
  return (res.rowCount ?? 0) > 0;
}

/** Merges keys into one item's metadata.engine. Returns the new engine object, or null if not found. */
export async function mergeEngine(userId: string, itemId: string, patch: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const res = await query(
    `UPDATE cloud_items
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('engine', COALESCE(metadata->'engine', '{}'::jsonb) || $1::jsonb),
           updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING metadata->'engine' AS engine`,
    [JSON.stringify(patch), itemId, userId]
  );
  return (res.rows[0]?.engine as Record<string, unknown>) ?? null;
}

export async function loadItem(userId: string, itemId: string): Promise<(EngineItem & { project_id: string | null }) | null> {
  const res = await query('SELECT id, cloud_type, title, content, metadata, project_id FROM cloud_items WHERE id = $1 AND user_id = $2', [itemId, userId]);
  return (res.rows[0] as (EngineItem & { project_id: string | null })) ?? null;
}

export const projectParam = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
