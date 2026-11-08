import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { getAiConfig, noKeyResponse, aiErrorResponse } from '@/lib/ai-key';
import { query } from '@/lib/db';
import {
  buildNarrativePrompt,
  describeWeightProfile,
  predictabilityToTemperature,
  NarrativeWeights,
} from '@/lib/narrative-prompt';
import { generate, providerOfModel, type AiConfig } from '@/lib/ai';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id: plotId } = await params;
  const body = await req.json().catch(() => ({}));
  const { aiNode, dimensionOverrides, predictabilityOverride } = body as {
    aiNode?: { model?: string; apiKey?: string; temperature?: number; systemPrompt?: string };
    dimensionOverrides?: Partial<NarrativeWeights['dimensions']>;
    predictabilityOverride?: number;
  };

  try {
    // 1. Fetch plot + verify ownership
    const plotRows = await query(
      `SELECT p.id, p.name, p.content, p.chapter_id, p.sort_order, a.user_id as arc_user_id
       FROM plots p
       JOIN chapters ch ON ch.id = p.chapter_id
       JOIN arcs a ON a.id = ch.arc_id
       WHERE p.id = $1`,
      [plotId]
    );

    if (!plotRows.rows.length) {
      return NextResponse.json({ error: 'Plot not found' }, { status: 404 });
    }
    const plot = plotRows.rows[0];
    if (plot.arc_user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Fetch dimension weights (or use defaults)
    const dimRows = await query(
      `SELECT characters_pct, ideas_pct, scene_pct, arc_pct, predictability
       FROM plot_dimension_weights WHERE plot_id = $1`,
      [plotId]
    );

    const rawDim = dimRows.rows[0];
    const dimensions: NarrativeWeights['dimensions'] = {
      characters_pct: Number(rawDim?.characters_pct ?? 25),
      ideas_pct: Number(rawDim?.ideas_pct ?? 25),
      scene_pct: Number(rawDim?.scene_pct ?? 25),
      arc_pct: Number(rawDim?.arc_pct ?? 25),
      ...dimensionOverrides,
    };
    const predictability = predictabilityOverride ?? Number(rawDim?.predictability ?? 50);

    // 3. Fetch element weights
    const elemRows = await query(
      `SELECT dimension, element_id, element_type, weight
       FROM plot_element_weights WHERE plot_id = $1`,
      [plotId]
    );

    const ideaElemIds = elemRows.rows
      .filter((r: Record<string, string>) => r.dimension === 'ideas')
      .map((r: Record<string, string>) => ({ id: r.element_id, weight: Number(r.weight) }));

    // 4. Fetch idea texts
    const ideas: NarrativeWeights['ideas'] = [];
    if (ideaElemIds.length > 0) {
      const ids = ideaElemIds.map(e => e.id);
      const ideaRows = await query(
        `SELECT id, COALESCE(NULLIF(content, ''), title) AS text, final_state_manual FROM cloud_items
         WHERE id = ANY($1::uuid[]) AND user_id = $2 AND cloud_type = 'ideas'`,
        [ids, userId]
      );
      for (const row of ideaRows.rows) {
        const elem = ideaElemIds.find((e) => e.id === row.id);
        if (elem) {
          ideas.push({
            text: row.text,
            weight: elem.weight,
            finalState: row.final_state_manual ?? undefined,
          });
        }
      }
    }

    // Characters: placeholder until Character Cloud is built
    const characters: NarrativeWeights['characters'] = [];

    // 5. Fetch previous plot content
    const prevRows = await query(
      `SELECT content FROM plots
       WHERE chapter_id = $1 AND sort_order < $2
       ORDER BY sort_order DESC LIMIT 1`,
      [plot.chapter_id, plot.sort_order]
    );
    const prevPlotContent = prevRows.rows[0]?.content ?? undefined;

    // 6. Build NarrativeWeights and prompt
    const weights: NarrativeWeights = {
      dimensions,
      predictability,
      characters,
      ideas,
      prevPlotContent: prevPlotContent ?? undefined,
      plotName: plot.name,
    };

    const prompt = buildNarrativePrompt(weights);
    const weightProfile = describeWeightProfile(weights);
    const temperature = predictabilityToTemperature(predictability);

    // 7. Generate with the user's model (an AI node may choose its own model, or carry a key in older graphs)
    let ai: AiConfig | null = await getAiConfig(userId);
    if (aiNode?.apiKey && aiNode.model) ai = { provider: providerOfModel(aiNode.model) ?? 'google', apiKey: aiNode.apiKey, model: aiNode.model };
    else if (ai && aiNode?.model) ai = { ...ai, model: aiNode.model };
    if (!ai) return noKeyResponse();
    let content: string;
    try {
      content = await generate({
        ai,
        system: `You write prose for an author's story, one plot section at a time, following their directive exactly: the weights decide what drives the scene and what stays in the background. Write prose, not a summary or notes. ${aiNode?.systemPrompt ?? ''}`.trim(),
        prompt,
        temperature: aiNode?.temperature ?? temperature,
        maxTokens: 4096,
      });
    } catch (e) {
      return aiErrorResponse(e, 'Generation failed');
    }

    return NextResponse.json({ content, prompt, weightProfile });
  } catch (err) {
    console.error('[generate]', err);
    return NextResponse.json(
      { error: `Generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
