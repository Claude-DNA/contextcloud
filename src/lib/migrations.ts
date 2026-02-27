import { query, isDbAvailable } from '@/lib/db';

export async function runMigrations() {
  if (!(await isDbAvailable())) {
    console.error('Database not available — skipping migrations');
    return;
  }

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS cloud_drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'cloud' CHECK (type IN ('cloud', 'flow')),
        layers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        canvas_json JSONB,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        tube_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_cloud_drafts_user_id ON cloud_drafts (user_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_cloud_drafts_status ON cloud_drafts (status)
    `);

    console.log('Migrations complete');
  } catch (e) {
    console.error('Migration error:', e);
  }
}
