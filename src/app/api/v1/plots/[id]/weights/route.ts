import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  // Verify plot belongs to user
  const plotCheck = await query(
    `SELECT p.id FROM plots p
     JOIN chapters c ON p.chapter_id = c.id
     JOIN arcs a ON c.arc_id = a.id
     WHERE p.id = $1 AND a.user_id = $2`,
    [id, session.user.id]
  );
  if (plotCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
  }

  // Get dimension weights
  const dimRes = await query(
    'SELECT * FROM plot_dimension_weights WHERE plot_id = $1',
    [id]
  );

  // Get element weights
  const elemRes = await query(
    'SELECT * FROM plot_element_weights WHERE plot_id = $1',
    [id]
  );

  return NextResponse.json({
    dimensions: dimRes.rows[0] || {
      characters_pct: 25.0,
      ideas_pct: 25.0,
      scene_pct: 25.0,
      arc_pct: 25.0,
      predictability: 50.0,
    },
    elements: elemRes.rows,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  // Verify plot belongs to user
  const plotCheck = await query(
    `SELECT p.id FROM plots p
     JOIN chapters c ON p.chapter_id = c.id
     JOIN arcs a ON c.arc_id = a.id
     WHERE p.id = $1 AND a.user_id = $2`,
    [id, session.user.id]
  );
  if (plotCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
  }

  const body = await req.json();
  const { dimensions, elements } = body;

  // Upsert dimension weights
  if (dimensions) {
    const { characters_pct, ideas_pct, scene_pct, arc_pct, predictability } = dimensions;
    await query(
      `INSERT INTO plot_dimension_weights (plot_id, characters_pct, ideas_pct, scene_pct, arc_pct, predictability)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (plot_id) DO UPDATE SET
         characters_pct = $2,
         ideas_pct = $3,
         scene_pct = $4,
         arc_pct = $5,
         predictability = $6,
         updated_at = NOW()`,
      [id, characters_pct ?? 25.0, ideas_pct ?? 25.0, scene_pct ?? 25.0, arc_pct ?? 25.0, predictability ?? 50.0]
    );
  }

  // Replace element weights
  if (elements && Array.isArray(elements)) {
    await query('DELETE FROM plot_element_weights WHERE plot_id = $1', [id]);
    for (const elem of elements) {
      await query(
        `INSERT INTO plot_element_weights (plot_id, dimension, element_id, element_type, weight, locked)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, elem.dimension, elem.element_id, elem.element_type, elem.weight ?? 1.0, elem.locked ?? false]
      );
    }
  }

  // Return updated data
  const dimRes = await query('SELECT * FROM plot_dimension_weights WHERE plot_id = $1', [id]);
  const elemRes = await query('SELECT * FROM plot_element_weights WHERE plot_id = $1', [id]);

  return NextResponse.json({
    dimensions: dimRes.rows[0],
    elements: elemRes.rows,
  });
}
