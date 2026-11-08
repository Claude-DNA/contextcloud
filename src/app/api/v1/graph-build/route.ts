import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { generateJson } from '@/lib/gemini';

/**
 * Causal Propagation Engine: builds the story graph from a project's clouds.
 *
 * The old version asked one AI request for the whole graph, coordinates included, in 8,000 tokens,
 * so it broke after four or five scenes and continuity depended on the model following instructions.
 * Now code owns the topology and layout; the AI is asked one scene at a time what happens to the
 * characters, places and rules in it, given each one's state after the previous scene. A character's
 * state entering scene N is, by construction, their state leaving scene N-1.
 */

export const maxDuration = 300;
const TIME_BUDGET_MS = 270_000; // stop early and return a partial graph rather than time out

type Kind = 'character' | 'stage' | 'world';
type Delta = 'unchanged' | 'intensified' | 'damaged' | 'improved' | 'transformed' | 'persistent';
const DELTAS: Delta[] = ['unchanged', 'intensified', 'damaged', 'improved', 'transformed', 'persistent'];

interface Item { id: string; cloud_type: string; title: string; content: string; tags: string[] | null }
interface BuildNode { id: string; type: string; position: { x: number; y: number }; data: { title: string; content: string; type: string } }
interface BuildEdge { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string; animated?: boolean; style?: Record<string, unknown> }

interface SceneResult {
  consequence?: string;
  characters?: { id: string; agency?: string; state_out?: string; delta?: string }[];
  stages?: { id: string; state_out?: string; delta?: string }[];
  worlds?: { id: string; state_out?: string; delta?: string }[];
  themes?: string[];
  references?: string[];
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    consequence: { type: 'STRING' },
    characters: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: { type: 'STRING' }, agency: { type: 'STRING' }, state_out: { type: 'STRING' }, delta: { type: 'STRING', enum: DELTAS } },
        required: ['id', 'state_out', 'delta'],
      },
    },
    stages: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, state_out: { type: 'STRING' }, delta: { type: 'STRING', enum: DELTAS } }, required: ['id', 'delta'] } },
    worlds: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, state_out: { type: 'STRING' }, delta: { type: 'STRING', enum: DELTAS } }, required: ['id', 'delta'] } },
    themes: { type: 'ARRAY', items: { type: 'STRING' } },
    references: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['consequence'],
};

const EDGE = {
  sceneChain: { animated: true, style: { strokeDasharray: '5,5', stroke: '#10b981' } },
  charChain: { animated: false, style: { stroke: '#8b5cf6', strokeWidth: 1.5 } },
  influence: { animated: true, style: { strokeDasharray: '5,5', stroke: '#ec4899' } },
};

const brief = (s: string, n: number) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function referenceType(item: Item): string {
  const t = `${item.title} ${(item.tags ?? []).join(' ')} ${item.content.slice(0, 300)}`.toLowerCase();
  if (/\b(film|movie|series|tv|episode|director)\b/.test(t)) return 'filmReference';
  if (/\b(song|album|music|composer|symphony|band)\b/.test(t)) return 'musicReference';
  if (/\b(painting|artwork|sculpture|painter|artist|museum)\b/.test(t)) return 'artReference';
  if (/\b(war|battle|history|historical|revolution|event|treaty|century)\b/.test(t)) return 'realEventReference';
  return 'bookReference';
}

function scenePrompt(
  scene: Item,
  index: number,
  total: number,
  entities: { id: string; kind: Kind; title: string; state: string }[],
  themes: Item[],
  references: Item[]
): string {
  return `SCENE_STATES
You track continuity in a story, one scene at a time. This is scene ${index + 1} of ${total}.

SCENE: ${scene.title}
${brief(scene.content, 3000)}

ENTITIES (with their state entering this scene)
${entities.map((e) => `- id:"${e.id}" kind:"${e.kind}" ${e.title}: ${brief(e.state, 400)}`).join('\n') || '(none)'}

THEMES
${themes.map((t) => `- id:"${t.id}" ${t.title}: ${brief(t.content, 160)}`).join('\n') || '(none)'}

REFERENCES
${references.map((r) => `- id:"${r.id}" ${r.title}: ${brief(r.content, 160)}`).join('\n') || '(none)'}

For this scene only, return:
- "consequence": one sentence on what the scene changes.
- "characters": up to 3 characters who are present, directly affected or causally relevant. For each: "agency" (3-4 sentences on their choices and actions here), "state_out" (their state leaving the scene, 2-3 sentences), "delta" (one of ${DELTAS.join(', ')}).
- "stages": up to 2 places used in the scene. "delta" unchanged unless the scene changes the place; then give "state_out".
- "worlds": up to 2 world rules the scene tests, reveals or changes, with "state_out" and "delta".
- "themes" and "references": ids of up to 3 of each that bear on this scene.
Use only the ids listed above. Never invent major facts; if a change is implied but not stated, say "(derived from scene outcome)".`;
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const apiKey = await getGeminiKey(userId);
  if (!apiKey) return noKeyResponse();

  const { project_id, scene_ids } = (await req.json().catch(() => ({}))) as { project_id?: string; scene_ids?: string[] };
  const scope = project_id ? 'project_id = $2' : 'project_id IS NULL';
  const res = await query(
    `SELECT id, cloud_type, title, content, tags FROM cloud_items WHERE user_id = $1 AND ${scope}
     ORDER BY cloud_type, sort_order, created_at`,
    project_id ? [userId, project_id] : [userId]
  );
  const items = res.rows as Item[];
  const of = (t: string) => items.filter((i) => i.cloud_type === t);

  let scenes = of('arc');
  if (scene_ids?.length) scenes = scenes.filter((s) => scene_ids.includes(s.id));
  if (scenes.length === 0) {
    return NextResponse.json({ error: 'Add arc scenes first: the graph is built along the arc.' }, { status: 400 });
  }
  const characters = of('characters');
  const stages = of('scenes');
  const worlds = of('world');
  const themes = of('ideas');
  const references = of('references');
  const byId = new Map(items.map((i) => [i.id, i]));

  // Each entity's current state; starts as its cloud description.
  const state = new Map<string, string>();
  for (const e of [...characters, ...stages, ...worlds]) state.set(e.id, e.content || e.title);

  const nodes: BuildNode[] = [];
  const edges: BuildEdge[] = [];
  const placedInfluence = new Map<string, number>(); // theme/reference id → how many placed at its first scene column
  const node = (id: string, type: string, x: number, y: number, title: string, content: string) =>
    nodes.push({ id, type, position: { x, y }, data: { title, content, type } });
  const edge = (source: string, target: string, style: { animated: boolean; style: Record<string, unknown> }, handles: { sourceHandle?: string; targetHandle?: string } = {}) =>
    edges.push({ id: `e_${source}_${target}`, source, target, ...handles, ...style });

  let built = 0;
  let failed = 0;
  for (let i = 0; i < scenes.length; i++) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const scene = scenes[i];
    const sx = i * 850;
    const sceneNodeId = `scene_${scene.id}`;

    const entities = [
      ...characters.map((c) => ({ id: c.id, kind: 'character' as Kind, title: c.title, state: state.get(c.id) ?? '' })),
      ...stages.map((s) => ({ id: s.id, kind: 'stage' as Kind, title: s.title, state: state.get(s.id) ?? '' })),
      ...worlds.map((w) => ({ id: w.id, kind: 'world' as Kind, title: w.title, state: state.get(w.id) ?? '' })),
    ];

    let r: SceneResult = {};
    try {
      r = await generateJson<SceneResult>({
        apiKey,
        prompt: scenePrompt(scene, i, scenes.length, entities, themes, references),
        schema: SCHEMA,
        temperature: 0.3,
        maxOutputTokens: 4096,
      });
      built++;
    } catch (e) {
      failed++;
      console.error('[graph-build] scene failed:', scene.title, e instanceof Error ? e.message : e);
    }

    node(sceneNodeId, 'scene', sx, 0, scene.title, `${scene.content}${r.consequence ? `\n\nConsequence: ${r.consequence}` : ''}`);
    if (i > 0) edge(`scene_${scenes[i - 1].id}`, sceneNodeId, EDGE.sceneChain, { sourceHandle: 'output', targetHandle: 'prev_scene' });

    const valid = <T extends { id: string }>(list: T[] | undefined, pool: Item[], max: number) =>
      (list ?? []).filter((x) => pool.some((p) => p.id === x.id)).slice(0, max);

    valid(r.characters, characters, 3).forEach((c, slot) => {
      const item = byId.get(c.id)!;
      const y = -260 - slot * 200;
      const delta = DELTAS.includes(c.delta as Delta) ? c.delta : 'unchanged';
      const proxy = `proxy_${c.id}_${scene.id}`, sin = `statein_${c.id}_${scene.id}`, sout = `stateout_${c.id}_${scene.id}`;
      node(proxy, 'charactersProxy', sx - 220, y, item.title, c.agency || '(no agency described)');
      node(sin, 'stateIn', sx - 50, y, `${item.title} entering`, state.get(c.id) ?? '');
      node(sout, 'stateOut', sx + 140, y, `${item.title} after`, `${c.state_out || state.get(c.id)}\nDelta: ${delta}`);
      edge(proxy, sin, EDGE.charChain);
      edge(sin, sceneNodeId, EDGE.influence, { targetHandle: 'characters' });
      if (c.state_out) state.set(c.id, c.state_out); // the next scene's stateIn
    });

    const placeAndRule = (list: { id: string; state_out?: string; delta?: string }[], pool: Item[], kind: 'stage' | 'world', baseY: number, dx: number) =>
      valid(list, pool, 2).forEach((s, slot) => {
        const item = byId.get(s.id)!;
        const y = baseY + slot * 180;
        const delta = DELTAS.includes(s.delta as Delta) ? s.delta : 'unchanged';
        const inId = `${kind}in_${s.id}_${scene.id}`;
        node(inId, `${kind}In`, sx + dx, y, item.title, state.get(s.id) ?? item.content);
        edge(inId, sceneNodeId, EDGE.influence, { targetHandle: 'world' });
        if (delta !== 'unchanged' && s.state_out) {
          node(`${kind}out_${s.id}_${scene.id}`, `${kind}Out`, sx + dx + 160, y, `${item.title} (after)`, `${s.state_out}\nDelta: ${delta}`);
          state.set(s.id, s.state_out);
        }
      });
    placeAndRule(r.stages ?? [], stages, 'stage', 340, 0);
    placeAndRule(r.worlds ?? [], worlds, 'world', 560, 160);

    // Themes and references: one node each (synced to its cloud item), linked to every scene it bears on.
    const influence = (ids: string[] | undefined, pool: Item[], handle: string, baseY: number) => {
      for (const id of (ids ?? []).filter((x) => pool.some((p) => p.id === x)).slice(0, 3)) {
        const nodeId = `cloud_${id}`;
        if (!placedInfluence.has(id)) {
          const item = byId.get(id)!;
          const count = [...placedInfluence.values()].filter((v) => v === i).length;
          node(nodeId, handle === 'plot' ? 'theme' : referenceType(item), sx + 300, baseY + count * 160, item.title, item.content);
          placedInfluence.set(id, i);
        }
        edge(nodeId, sceneNodeId, EDGE.influence, { targetHandle: handle });
      }
    };
    influence(r.themes, themes, 'plot', 340);
    influence(r.references, references, 'references', 700);
  }

  const partial = built + failed < scenes.length;
  return NextResponse.json({
    nodes,
    edges,
    meta: {
      itemsUsed: items.length,
      nodesGenerated: nodes.length,
      edgesGenerated: edges.length,
      scenes: scenes.length,
      scenesBuilt: built,
      scenesFailed: failed,
      partial,
    },
  });
}
