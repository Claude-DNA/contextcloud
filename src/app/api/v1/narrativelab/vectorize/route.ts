import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { getAiConfig, noKeyResponse, aiErrorResponse } from '@/lib/ai-key';
import { query } from '@/lib/db';
import {
  VECTOR_SYSTEM,
  VECTOR_SCHEMA,
  buildVectorizationPrompt,
  parseVector,
  NarrativeVector,
  NARRATIVE_AXES,
} from '@/lib/narrative-vectors';
import { generate, type AiConfig } from '@/lib/ai';

async function score(prompt: string, ai: AiConfig): Promise<string> {
  return generate({ ai, light: true, system: VECTOR_SYSTEM, prompt, schema: VECTOR_SCHEMA, temperature: 0.2, maxTokens: 256 });
}

function vectorToRow(v: NarrativeVector) {
  return NARRATIVE_AXES.map(a => v[a]);
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { elementId, elementType, forceRefresh } = await req.json() as {
    elementId: string;
    elementType: 'idea' | 'character';
    forceRefresh?: boolean;
  };

  if (!elementId || !elementType) {
    return NextResponse.json({ error: 'elementId and elementType required' }, { status: 400 });
  }

  try {
    // The element's current text; it must belong to this user.
    let elementText = '';
    if (elementType === 'idea') {
      const rows = await query(
        `SELECT title, content FROM cloud_items WHERE id = $1 AND user_id = $2 AND cloud_type = 'ideas'`,
        [elementId, userId]
      );
      if (!rows.rows.length) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
      elementText = (rows.rows[0].content as string)?.trim() || (rows.rows[0].title as string);
    } else if (elementType === 'character') {
      return NextResponse.json({ error: 'Character vectorization coming in Character Cloud phase' }, { status: 400 });
    }

    // Reuse the stored vector only if the text hasn't changed since it was scored.
    if (!forceRefresh) {
      const existing = await query(
        `SELECT * FROM narrative_vectors WHERE element_id = $1 AND element_type = $2 AND element_text = $3`,
        [elementId, elementType, elementText]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const vector = Object.fromEntries(NARRATIVE_AXES.map(a => [a, Number(row[a])])) as NarrativeVector;
        return NextResponse.json({ vector, cached: true, elementId, elementType });
      }
    }


    // Score the element with the user's light model
    const ai = await getAiConfig(userId);
    if (!ai) return noKeyResponse();

    const prompt = buildVectorizationPrompt(elementType, elementText);
    let raw: string;
    try {
      raw = await score(prompt, ai);
    } catch (e) {
      return aiErrorResponse(e, 'Scoring failed');
    }
    const vector = parseVector(raw);

    if (!vector) {
      return NextResponse.json(
        { error: 'The model did not return scores in the expected form', raw },
        { status: 500 }
      );
    }

    // Upsert into narrative_vectors
    const vals = vectorToRow(vector);
    await query(
      `INSERT INTO narrative_vectors
         (element_id, element_type, element_text,
          emotional_intensity, philosophical_depth, physical_presence,
          plot_momentum, tension, mystery, intimacy, resolution_tendency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (element_id, element_type)
       DO UPDATE SET
         element_text = EXCLUDED.element_text,
         emotional_intensity = EXCLUDED.emotional_intensity,
         philosophical_depth = EXCLUDED.philosophical_depth,
         physical_presence   = EXCLUDED.physical_presence,
         plot_momentum       = EXCLUDED.plot_momentum,
         tension             = EXCLUDED.tension,
         mystery             = EXCLUDED.mystery,
         intimacy            = EXCLUDED.intimacy,
         resolution_tendency = EXCLUDED.resolution_tendency,
         computed_at         = NOW()`,
      [elementId, elementType, elementText, ...vals]
    );

    return NextResponse.json({ vector, cached: false, elementId, elementType });
  } catch (err) {
    console.error('[vectorize]', err);
    return NextResponse.json(
      { error: `Vectorization failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const elementId = searchParams.get('elementId');
  const elementType = searchParams.get('elementType');

  if (!elementId || !elementType) {
    return NextResponse.json({ error: 'elementId and elementType required' }, { status: 400 });
  }

  const rows = await query(
    `SELECT * FROM narrative_vectors WHERE element_id = $1 AND element_type = $2`,
    [elementId, elementType]
  );

  if (!rows.rows.length) {
    return NextResponse.json({ vector: null, exists: false });
  }

  const row = rows.rows[0];
  const vector = Object.fromEntries(NARRATIVE_AXES.map(a => [a, Number(row[a])])) as NarrativeVector;
  return NextResponse.json({ vector, exists: true, computedAt: row.computed_at });
}
