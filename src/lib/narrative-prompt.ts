/**
 * narrative-prompt.ts
 * Pure functions for building weight-structured AI narrative directives.
 * No API calls — just string construction from NarrativeWeights.
 */

export interface NarrativeWeights {
  dimensions: {
    characters_pct: number;
    ideas_pct: number;
    scene_pct: number;
    arc_pct: number;
  };
  predictability: number; // 0 = Dostoevsky chaotic, 100 = genre predictable
  characters: Array<{ name: string; description: string; weight: number }>;
  ideas: Array<{
    text: string;
    weight: number;
    finalState?: string;
    transformation?: { text: string; type: 'additive' | 'override'; weight: number };
  }>;
  sceneContext?: string;
  prevPlotContent?: string;
  plotName: string;
}

function normalize(items: Array<{ weight: number }>): number[] {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total === 0) return items.map(() => Math.round(100 / items.length));
  return items.map(i => Math.round((i.weight / total) * 100));
}

function ideaEmphasis(pct: number): string {
  if (pct >= 40) return 'surface explicitly — visible in dialogue and action';
  if (pct >= 20) return 'active undertone — shapes mood without dominating';
  return 'faint shadow — barely perceptible, shapes atmosphere only';
}

function predictabilityBlock(p: number): string {
  if (p < 30) {
    return [
      `PREDICTABILITY: ${p}/100 — DOSTOEVSKY MODE`,
      'Do NOT take the expected path. Find what is internally true for these characters',
      'but arrives from an unexpected direction. Coherent surprise, not random chaos.',
      'The destination should feel inevitable in retrospect, but arrive from the side.',
    ].join('\n');
  }
  if (p < 70) {
    return [
      `PREDICTABILITY: ${p}/100 — BALANCED`,
      'Blend the expected with the surprising. One unexpected element within',
      'an otherwise coherent narrative progression.',
    ].join('\n');
  }
  return [
    `PREDICTABILITY: ${p}/100 — GENRE MODE`,
    'Follow the narrative logic directly. Clear cause and effect.',
    'The reader should feel in control of where events are heading.',
  ].join('\n');
}

export function buildNarrativePrompt(w: NarrativeWeights): string {
  const lines: string[] = [];

  lines.push(`NARRATIVE DIRECTIVE — "${w.plotName}"`);
  lines.push('═'.repeat(60));
  lines.push('');

  // ── Dimension Distribution ──
  lines.push('DIMENSION DISTRIBUTION');
  lines.push('─'.repeat(40));

  // Characters
  lines.push(`▸ CHARACTERS (${w.dimensions.characters_pct}%): Character psychology, dialogue, relationships`);
  if (w.characters.length > 0) {
    const charPcts = normalize(w.characters);
    const sorted = [...w.characters]
      .map((c, i) => ({ ...c, pct: charPcts[i] }))
      .sort((a, b) => b.pct - a.pct);
    for (const c of sorted) {
      const role = c.pct >= 50 ? 'drives the scene' : c.pct >= 25 ? 'active presence' : 'minor role';
      lines.push(`  • ${c.name} (${c.pct}%): ${c.description || role}`);
    }
  } else {
    lines.push('  (No specific characters assigned — write character-generically)');
  }
  lines.push('');

  // Ideas
  lines.push(`▸ IDEAS (${w.dimensions.ideas_pct}%): Philosophical / thematic layer`);
  if (w.ideas.length > 0) {
    const ideaPcts = normalize(w.ideas);
    const sorted = [...w.ideas]
      .map((idea, i) => ({ ...idea, pct: ideaPcts[i] }))
      .sort((a, b) => b.pct - a.pct);
    for (const idea of sorted) {
      lines.push(`  • "${idea.text}" (${idea.pct}%) — ${ideaEmphasis(idea.pct)}`);
      if (idea.transformation) {
        const sign = idea.transformation.type === 'override' ? '⊘ OVERRIDE' : '⊕ ADDS';
        lines.push(`    ${sign}: "${idea.transformation.text}"`);
      }
      if (idea.finalState) {
        lines.push(`    → Final state: "${idea.finalState}"`);
      }
    }
  } else {
    lines.push('  (No ideas assigned — let themes emerge naturally)');
  }
  lines.push('');

  // Scene
  lines.push(`▸ SCENE (${w.dimensions.scene_pct}%): Physical presence, atmosphere, sensory detail`);
  if (w.sceneContext) {
    lines.push(`  ${w.sceneContext}`);
  } else if (w.dimensions.scene_pct >= 30) {
    lines.push('  Strong physical grounding required — describe space, light, texture, sound');
  } else if (w.dimensions.scene_pct >= 15) {
    lines.push('  Moderate physical grounding — anchor scene with selective sensory detail');
  } else {
    lines.push('  Minimal scene description — environment is background only');
  }
  lines.push('');

  // Arc
  lines.push(`▸ ARC (${w.dimensions.arc_pct}%): Narrative momentum / plot advancement`);
  if (w.dimensions.arc_pct < 15) {
    lines.push('  PAUSE — do not advance the plot. This is an emotional or reflective beat.');
  } else if (w.dimensions.arc_pct < 35) {
    lines.push('  SLOW — gentle advancement. The situation shifts slightly.');
  } else if (w.dimensions.arc_pct < 60) {
    lines.push('  ACTIVE — meaningful plot movement. Something changes.');
  } else {
    lines.push('  DRIVE — major advancement. The situation transforms significantly.');
  }
  lines.push('');

  // ── Predictability ──
  lines.push('═'.repeat(60));
  lines.push(predictabilityBlock(w.predictability));
  lines.push('');

  // ── Context ──
  if (w.prevPlotContent) {
    lines.push('═'.repeat(60));
    lines.push('PREVIOUS PLOT:');
    const prev = w.prevPlotContent.slice(0, 300);
    lines.push(prev + (w.prevPlotContent.length > 300 ? '...' : ''));
    lines.push('');
  }

  // ── Generate ──
  lines.push('═'.repeat(60));
  lines.push(`GENERATE: "${w.plotName}"`);
  lines.push('');
  lines.push('Write the narrative content for this plot chunk.');
  lines.push('Weight determines prominence — not just mention frequency.');
  lines.push('High weight = drives the scene. Low weight = shapes atmosphere silently.');
  lines.push('Write prose, not a summary. Show, do not tell the distribution.');

  return lines.join('\n');
}

export function describeWeightProfile(w: NarrativeWeights): string {
  const { characters_pct, ideas_pct, scene_pct, arc_pct } = w.dimensions;

  const dominant = [
    { label: 'Character-driven', pct: characters_pct },
    { label: 'Idea-rich', pct: ideas_pct },
    { label: 'Scene-focused', pct: scene_pct },
    { label: 'Plot-driven', pct: arc_pct },
  ].sort((a, b) => b.pct - a.pct);

  const topChar = w.characters.sort((a, b) => b.weight - a.weight)[0];
  const topIdea = w.ideas.sort((a, b) => b.weight - a.weight)[0];

  const parts: string[] = [];
  parts.push(`${dominant[0].label} (${dominant[0].pct}%)`);
  if (dominant[1].pct >= 20) parts.push(`${dominant[1].label.toLowerCase()} (${dominant[1].pct}%)`);
  if (topChar) parts.push(`${topChar.name} leads`);
  if (topIdea) parts.push(`"${topIdea.text.slice(0, 40)}${topIdea.text.length > 40 ? '…' : ''}" active`);

  const predLabel = w.predictability < 30
    ? 'Expect coherent surprise'
    : w.predictability > 70
    ? 'Predictable arc'
    : 'Balanced pacing';

  return parts.join(' · ') + ` · ${predLabel} (${w.predictability})`;
}

/**
 * Derive temperature from predictability.
 * Low predictability → high temperature (more surprising outputs)
 */
export function predictabilityToTemperature(predictability: number): number {
  // Map 0-100 predictability to 1.0-0.3 temperature
  return Math.round((1.0 - (predictability / 100) * 0.7) * 10) / 10;
}
