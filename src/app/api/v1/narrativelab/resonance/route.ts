import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query } from '@/lib/db';
import {
  NarrativeVector,
  NARRATIVE_AXES,
  analyzeResonance,
  detectGaps,
  weightedSum,
} from '@/lib/narrative-vectors';

function rowToVector(row: Record<string, unknown>): NarrativeVector {
  return Object.fromEntries(NARRATIVE_AXES.map(a => [a, Number(row[a])])) as NarrativeVector;
}

/**
 * POST /api/v1/narrativelab/resonance
 *
 * Given a list of element ids+types, returns:
 * - resonance pairs (all combinations) with similarity/conflict scores
 * - gap analysis: which narrative axes are underrepresented
 * - combined vector: weighted sum of all elements
 *
 * Elements not yet vectorized are skipped (client should vectorize first).
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { elements } = await req.json() as {
    elements: Array<{ id: string; type: 'idea' | 'character'; label: string; weight: number }>;
  };

  if (!elements?.length) {
    return NextResponse.json({ resonancePairs: [], gaps: [], combined: null, unvectorized: [] });
  }

  try {
    // Fetch vectors for all elements
    const ids = elements.map(e => e.id);
    const rows = await query(
      `SELECT element_id, element_type, element_text, ${NARRATIVE_AXES.join(', ')}
       FROM narrative_vectors
       WHERE element_id = ANY($1::uuid[])`,
      [ids]
    );

    const vectorMap = new Map<string, NarrativeVector>();
    for (const row of rows.rows) {
      vectorMap.set(row.element_id as string, rowToVector(row as Record<string, unknown>));
    }

    const unvectorized = elements
      .filter(e => !vectorMap.has(e.id))
      .map(e => e.id);

    const vectorized = elements
      .filter(e => vectorMap.has(e.id))
      .map(e => ({
        ...e,
        vector: vectorMap.get(e.id)!,
      }));

    // Compute all resonance pairs
    const resonancePairs = [];
    for (let i = 0; i < vectorized.length; i++) {
      for (let j = i + 1; j < vectorized.length; j++) {
        const a = vectorized[i];
        const b = vectorized[j];
        resonancePairs.push(
          analyzeResonance(
            { id: a.id, label: a.label, type: a.type, vector: a.vector },
            { id: b.id, label: b.label, type: b.type, vector: b.vector }
          )
        );
      }
    }

    // Sort: resonating pairs first, then tensioning, then neutral
    resonancePairs.sort((a, b) => {
      const order = { resonates: 0, tensions: 1, neutral: 2 };
      return order[a.relationship] - order[b.relationship] || b.similarity - a.similarity;
    });

    // Gap detection on weighted combination
    const gaps = detectGaps(
      vectorized.map(e => ({ vector: e.vector, weight: e.weight }))
    );

    // Combined vector (weighted sum)
    const combined = vectorized.length > 0
      ? weightedSum(vectorized.map(e => ({ vector: e.vector, weight: e.weight })))
      : null;

    return NextResponse.json({
      resonancePairs,
      gaps,
      combined,
      unvectorized,
      total: vectorized.length,
    });
  } catch (err) {
    console.error('[resonance]', err);
    return NextResponse.json(
      { error: `Resonance analysis failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
