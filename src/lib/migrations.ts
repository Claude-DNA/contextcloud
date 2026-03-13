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

    await query(`CREATE INDEX IF NOT EXISTS idx_cloud_drafts_user_id ON cloud_drafts (user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_cloud_drafts_status ON cloud_drafts (status)`);

    // Ideas
    await query(`
      CREATE TABLE IF NOT EXISTS ideas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        text TEXT NOT NULL,
        image_url TEXT,
        weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
        locked BOOLEAN NOT NULL DEFAULT false,
        final_state_manual TEXT,
        final_state_generated TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Idea transformations
    await query(`
      CREATE TABLE IF NOT EXISTS idea_transformations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        source_node_id TEXT,
        source_node_level TEXT,
        text TEXT NOT NULL,
        weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
        locked BOOLEAN NOT NULL DEFAULT false,
        transform_type TEXT NOT NULL DEFAULT 'additive',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Arcs
    await query(`
      CREATE TABLE IF NOT EXISTS arcs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Chapters
    await query(`
      CREATE TABLE IF NOT EXISTS chapters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Plots
    await query(`
      CREATE TABLE IF NOT EXISTS plots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active_alternative_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Plot alternatives
    await query(`
      CREATE TABLE IF NOT EXISTS plot_alternatives (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plot_id UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Plot dimension weights
    await query(`
      CREATE TABLE IF NOT EXISTS plot_dimension_weights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plot_id UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE UNIQUE,
        characters_pct NUMERIC(5,2) NOT NULL DEFAULT 25.0,
        ideas_pct NUMERIC(5,2) NOT NULL DEFAULT 25.0,
        scene_pct NUMERIC(5,2) NOT NULL DEFAULT 25.0,
        arc_pct NUMERIC(5,2) NOT NULL DEFAULT 25.0,
        predictability NUMERIC(5,2) NOT NULL DEFAULT 50.0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Plot element weights
    await query(`
      CREATE TABLE IF NOT EXISTS plot_element_weights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plot_id UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
        dimension TEXT NOT NULL,
        element_id UUID NOT NULL,
        element_type TEXT NOT NULL,
        weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
        locked BOOLEAN NOT NULL DEFAULT false
      )
    `);

    // Weight overrides
    await query(`
      CREATE TABLE IF NOT EXISTS weight_overrides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        node_id UUID NOT NULL,
        node_type TEXT NOT NULL,
        idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        weight NUMERIC(5,2) NOT NULL,
        locked BOOLEAN NOT NULL DEFAULT false,
        UNIQUE(node_id, node_type, idea_id)
      )
    `);

    // Narrative vectors (Phase 2 — 8-axis element analysis)
    await query(`
      CREATE TABLE IF NOT EXISTS narrative_vectors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        element_id UUID NOT NULL,
        element_type TEXT NOT NULL,  -- 'idea' | 'character'
        element_text TEXT NOT NULL,  -- snapshot of text when vectorized
        emotional_intensity NUMERIC(4,3) NOT NULL DEFAULT 0,
        philosophical_depth NUMERIC(4,3) NOT NULL DEFAULT 0,
        physical_presence   NUMERIC(4,3) NOT NULL DEFAULT 0,
        plot_momentum       NUMERIC(4,3) NOT NULL DEFAULT 0,
        tension             NUMERIC(4,3) NOT NULL DEFAULT 0,
        mystery             NUMERIC(4,3) NOT NULL DEFAULT 0,
        intimacy            NUMERIC(4,3) NOT NULL DEFAULT 0,
        resolution_tendency NUMERIC(4,3) NOT NULL DEFAULT 0,
        computed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(element_id, element_type)
      )
    `);

    // Cloud items — shared table for Characters, References, Scenes, World clouds
    await query(`
      CREATE TABLE IF NOT EXISTS cloud_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        cloud_type TEXT NOT NULL CHECK (cloud_type IN ('characters', 'references', 'scenes', 'world')),
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        tags TEXT[] NOT NULL DEFAULT '{}',
        metadata JSONB NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cloud_items_user_type ON cloud_items (user_id, cloud_type)`);

    // Expand cloud_type CHECK to include ideas + arc (chat-based creation)
    await query(`ALTER TABLE cloud_items DROP CONSTRAINT IF EXISTS cloud_items_cloud_type_check`);
    await query(`ALTER TABLE cloud_items ADD CONSTRAINT cloud_items_cloud_type_check CHECK (cloud_type IN ('characters', 'references', 'scenes', 'world', 'ideas', 'arc'))`);

    // Cloud item final states (columns added to cloud_items)
    await query(`ALTER TABLE cloud_items ADD COLUMN IF NOT EXISTS final_state_manual TEXT`);
    await query(`ALTER TABLE cloud_items ADD COLUMN IF NOT EXISTS final_state_generated TEXT`);

    // Cloud item transformations
    await query(`
      CREATE TABLE IF NOT EXISTS cloud_item_transformations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cloud_item_id UUID NOT NULL REFERENCES cloud_items(id) ON DELETE CASCADE,
        source_node_id TEXT,
        source_node_level TEXT,
        text TEXT NOT NULL,
        weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
        locked BOOLEAN NOT NULL DEFAULT false,
        transform_type TEXT NOT NULL DEFAULT 'additive',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cloud_item_trans_item_id ON cloud_item_transformations (cloud_item_id)`);

    // BYOT — user-stored Google AI key
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_ai_key TEXT`);

    console.log('Migrations complete');
  } catch (e) {
    console.error('Migration error:', e);
  }
}
