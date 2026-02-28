/**
 * narrative-vectors.ts
 * 8-axis narrative vector system.
 *
 * Each element (idea, character) is rated 0.0–1.0 on 8 narrative axes.
 * These vectors enable mathematical analysis of how elements interact
 * (resonance, conflict, gap detection) before any content is generated.
 */

export const NARRATIVE_AXES = [
  'emotional_intensity',
  'philosophical_depth',
  'physical_presence',
  'plot_momentum',
  'tension',
  'mystery',
  'intimacy',
  'resolution_tendency',
] as const;

export type NarrativeAxis = typeof NARRATIVE_AXES[number];

export type NarrativeVector = Record<NarrativeAxis, number>;

export const AXIS_LABELS: Record<NarrativeAxis, { label: string; description: string; emoji: string }> = {
  emotional_intensity:  { label: 'Emotional',    description: 'How emotionally charged — love, grief, anger, fear',        emoji: '❤️' },
  philosophical_depth:  { label: 'Philosophical', description: 'Deals with universal, abstract, or existential concepts',   emoji: '🧠' },
  physical_presence:    { label: 'Physical',      description: 'Grounded in sensory, material, embodied reality',           emoji: '🌍' },
  plot_momentum:        { label: 'Momentum',      description: 'Drives narrative forward, advances situation',              emoji: '⚡' },
  tension:              { label: 'Tension',        description: 'Unresolved conflict, pressure, stakes',                    emoji: '⚔️' },
  mystery:              { label: 'Mystery',        description: 'Uncertainty, the unknown, unanswered questions',           emoji: '🌫️' },
  intimacy:             { label: 'Intimacy',       description: 'Closeness, vulnerability, personal connection',            emoji: '🤝' },
  resolution_tendency:  { label: 'Resolution',    description: 'Pushes toward closure, answers, completeness',             emoji: '✅' },
};

/** Axis complements — high on one + high on the other = dramatic tension source */
export const COMPLEMENT_PAIRS: Array<[NarrativeAxis, NarrativeAxis]> = [
  ['mystery', 'resolution_tendency'],  // mystery wants openness; resolution closes it
  ['tension', 'intimacy'],             // raw conflict vs vulnerable closeness
  ['philosophical_depth', 'physical_presence'], // abstract vs embodied
];

// ── Vector Math ──────────────────────────────────────────────────────────────

/** Dot product of two narrative vectors (0–1 range → result 0–8) */
export function dotProduct(a: NarrativeVector, b: NarrativeVector): number {
  return NARRATIVE_AXES.reduce((sum, axis) => sum + a[axis] * b[axis], 0);
}

/** Magnitude of a vector */
export function magnitude(v: NarrativeVector): number {
  return Math.sqrt(NARRATIVE_AXES.reduce((sum, axis) => sum + v[axis] ** 2, 0));
}

/** Cosine similarity: 1 = perfect alignment, 0 = orthogonal, never negative (0–1 values) */
export function cosineSimilarity(a: NarrativeVector, b: NarrativeVector): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

/** Conflict score: 1 - cosine similarity. High = divergent = dramatic tension source */
export function conflictScore(a: NarrativeVector, b: NarrativeVector): number {
  return 1 - cosineSimilarity(a, b);
}

/** Weighted vector sum: combine multiple vectors with weights, normalized */
export function weightedSum(
  items: Array<{ vector: NarrativeVector; weight: number }>
): NarrativeVector {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight === 0) return zeroVector();

  const result = zeroVector();
  for (const { vector, weight } of items) {
    const pct = weight / totalWeight;
    for (const axis of NARRATIVE_AXES) {
      result[axis] += vector[axis] * pct;
    }
  }
  return result;
}

export function zeroVector(): NarrativeVector {
  return Object.fromEntries(NARRATIVE_AXES.map(a => [a, 0])) as NarrativeVector;
}

// ── Resonance Analysis ────────────────────────────────────────────────────────

export interface ResonancePair {
  elementA: { id: string; label: string; type: string };
  elementB: { id: string; label: string; type: string };
  similarity: number;   // cosine similarity 0–1
  conflict: number;     // 1 - similarity
  dominantAxis: NarrativeAxis;  // axis where both score highest
  relationship: 'resonates' | 'tensions' | 'neutral';
}

export function analyzeResonance(
  a: { id: string; label: string; type: string; vector: NarrativeVector },
  b: { id: string; label: string; type: string; vector: NarrativeVector }
): ResonancePair {
  const similarity = cosineSimilarity(a.vector, b.vector);
  const conflict = 1 - similarity;

  // Find the axis where combined score is highest
  const dominantAxis = NARRATIVE_AXES.reduce((best, axis) =>
    (a.vector[axis] + b.vector[axis] > a.vector[best] + b.vector[best]) ? axis : best
  );

  const relationship: ResonancePair['relationship'] =
    similarity > 0.7 ? 'resonates' :
    conflict > 0.5 ? 'tensions' :
    'neutral';

  return {
    elementA: { id: a.id, label: a.label, type: a.type },
    elementB: { id: b.id, label: b.label, type: b.type },
    similarity: Math.round(similarity * 100) / 100,
    conflict: Math.round(conflict * 100) / 100,
    dominantAxis,
    relationship,
  };
}

// ── Gap Detection ─────────────────────────────────────────────────────────────

export interface NarrativeGap {
  axis: NarrativeAxis;
  coverage: number;   // 0–1, weighted average across all elements
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

export function detectGaps(
  elements: Array<{ vector: NarrativeVector; weight: number }>
): NarrativeGap[] {
  if (elements.length === 0) return [];

  const combined = weightedSum(elements);
  const gaps: NarrativeGap[] = [];

  for (const axis of NARRATIVE_AXES) {
    const coverage = combined[axis];
    if (coverage < 0.25) {
      const { label, description } = AXIS_LABELS[axis];
      gaps.push({
        axis,
        coverage: Math.round(coverage * 100) / 100,
        severity: coverage < 0.1 ? 'high' : 'medium',
        suggestion: `${label} axis is weak (${(coverage * 100).toFixed(0)}%). Consider adding an element that ${description.toLowerCase()}.`,
      });
    }
  }

  return gaps.sort((a, b) => a.coverage - b.coverage);
}

// ── Gemini Vectorization Prompt ────────────────────────────────────────────────

export function buildVectorizationPrompt(elementType: string, elementText: string): string {
  const axisDescriptions = NARRATIVE_AXES
    .map(a => `  "${a}": ${AXIS_LABELS[a].description}`)
    .join('\n');

  return `You are a narrative analyst. Rate the following ${elementType} on 8 narrative axes.
Each axis should be rated 0.0 to 1.0 based on how strongly this element exhibits that quality.

${elementType.toUpperCase()}:
"${elementText}"

AXES:
${axisDescriptions}

Respond ONLY with a valid JSON object containing exactly these 8 keys with float values 0.0–1.0.
No explanation. No markdown. Just the JSON.

Example format:
{"emotional_intensity": 0.8, "philosophical_depth": 0.9, "physical_presence": 0.2, "plot_momentum": 0.1, "tension": 0.7, "mystery": 0.8, "intimacy": 0.7, "resolution_tendency": 0.3}`;
}

export function parseVectorFromGemini(text: string): NarrativeVector | null {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    // Validate all axes present and in range
    for (const axis of NARRATIVE_AXES) {
      if (typeof parsed[axis] !== 'number') return null;
      parsed[axis] = Math.max(0, Math.min(1, parsed[axis]));
    }
    return parsed as NarrativeVector;
  } catch {
    return null;
  }
}
