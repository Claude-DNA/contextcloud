import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CloudItem {
  id: string;
  cloud_type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface BuildNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { title: string; content?: string; type: string };
}

interface BuildEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
  style?: Record<string, unknown>;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildGraphPrompt(items: Record<string, CloudItem[]>): string {
  const arcScenes = items['arc'] || [];
  const characters = items['characters'] || [];
  const stages = items['scenes'] || [];
  const worldItems = items['world'] || [];
  const ideas = items['ideas'] || [];
  const references = items['references'] || [];

  const formatList = (list: CloudItem[]) =>
    list.map((i, idx) => `  [${idx}] id:"${i.id}" title:"${i.title}" content:"${i.content?.slice(0, 2000) || ''}"`).join('\n');

  return `You are Story Graph Builder -- the Causal Propagation Engine for contextcloud.studio.
Mission: turn a static Context Cloud into a living DAG where every node carries and transforms real state.
Characters, stages, and the world leave every scene with visible Scar Tissue -- unchanged, intensified, damaged, improved, transformed, or persistent.

OUTPUT: Return ONLY a single valid JSON object: { "nodes": [...], "edges": [...] }
No explanation, no markdown, no code fences. Just the JSON.

==========================================
CLOUD ITEMS (your input material)
==========================================

ARC SCENES (the graph spine -- one scene node each, in order):
${arcScenes.length ? formatList(arcScenes) : '  (none)'}

CHARACTERS (create proxy + stateIn + stateOut per scene appearance):
${characters.length ? formatList(characters) : '  (none)'}

STAGE LOCATIONS (create stageIn; stageOut only if scene changes the location):
${stages.length ? formatList(stages) : '  (none)'}

WORLD RULES (create worldIn; worldOut only if scene tests/reveals/changes the rule):
${worldItems.length ? formatList(worldItems) : '  (none)'}

THEMES / IDEAS (influence only -- connect to relevant scenes, no Out node):
${ideas.length ? formatList(ideas) : '  (none)'}

REFERENCES (influence only -- connect to relevant scenes, no Out node):
${references.length ? formatList(references) : '  (none)'}

==========================================
CORE CONTINUITY PROTOCOL (never break)
==========================================

1. State inheritance: stateIn[scene N] = stateOut[scene N-1] for the same entity.
   If a character/stage/world skips a scene, carry the last known stateOut forward.
2. Every stateOut / stageOut / worldOut must declare exactly one Delta:
   unchanged | intensified | damaged | improved | transformed | persistent
3. Scene, world, theme, reference nodes use verbatim Cloud content as single source of truth.
4. Only create character/stage/world scene-pair nodes if the item is PRESENT, DIRECTLY AFFECTED,
   or CAUSALLY RELEVANT in that scene. Do not attach every item to every scene.
   HARD LIMITS per scene: max 3 characters (proxy+stateIn+stateOut), max 2 stage items, max 2 world items.
   Choose the most causally important ones. Omit minor appearances.
5. If a sensory anchor is missing from source, write:
   Light: not specified | Sound: not specified | Smell: not specified
6. Never invent major facts. If a change is implied but not explicit, mark it:
   (derived from scene outcome)

==========================================
NODE TYPES & CONTENT RULES
==========================================

"scene"          verbatim arc beat content + 1-sentence consequence at the end
"charactersProxy" 3-4 sentences of the character's agency, choices, and actions in this scene
"stateIn"        last known stateOut formula (VERBATIM) + 2 sentences of inner feeling entering the scene
"stateOut"       updated formula + Delta category + 2 sentences of how they changed
"stageIn"        verbatim stage description + Light/Sound/Smell anchors as found in source
"stageOut"       same as stageIn + damage/improvement/change status + Delta category
"worldIn"        verbatim world rule or fact
"worldOut"       updated rule/fact + what the scene revealed or changed + Delta category
"theme"          verbatim -- influence only, no In/Out split
"bookReference"  verbatim -- books, written works
"filmReference"  verbatim -- films, TV series (use for Star Trek: Voyager, etc.)
"musicReference" verbatim -- songs, albums
"artReference"   verbatim -- paintings, visual art
"realEventReference" verbatim -- historical events, real people

CONTENT RULE: No node may have empty content or content of only one sentence.

==========================================
GRAPH TOPOLOGY
==========================================

scene[N].output --> scene[N+1].prev_scene
proxy --> stateIn --> scene (targetHandle: "characters")
stageIn --> scene (targetHandle: "world")
worldIn --> scene (targetHandle: "world")
theme --> scene (targetHandle: "plot")
reference --> scene (targetHandle: "references")

EDGE DIRECTION TABLE:
| connection            | source       | target      | sourceHandle | targetHandle  |
|-----------------------|--------------|-------------|--------------|---------------|
| scene chain           | scene N      | scene N+1   | "output"     | "prev_scene"  |
| character chain       | proxy        | stateIn     | (none)       | (none)        |
| character to scene    | stateIn      | scene       | (none)       | "characters"  |
| stage to scene        | stageIn      | scene       | (none)       | "world"       |
| world to scene        | worldIn      | scene       | (none)       | "world"       |
| theme to scene        | theme        | scene       | (none)       | "plot"        |
| reference to scene    | reference    | scene       | (none)       | "references"  |

WARNING: NEVER generate scene --> theme, scene --> world, or scene --> reference edges.
The scene "output" handle connects ONLY to the next scene's "prev_scene".
Out nodes (stateOut, stageOut, worldOut) are NOT connected by edges -- they are logically
linked by shared entityId + sceneId and serve as the source for the next scene's In node.

==========================================
LAYOUT
==========================================

Scenes:   x = sceneIndex * 850,       y = 0
Proxies:  x = sceneIndex*850 - 220,   y = -260 - (slot * 200)
stateIn:  x = sceneIndex*850 - 50,    y = -260 - (slot * 200)
stateOut: x = sceneIndex*850 + 140,   y = -260 - (slot * 200)
stageIn:  x = sceneIndex*850,         y = 340 + (slot * 180)
stageOut: x = sceneIndex*850 + 160,   y = 340 + (slot * 180)
worldIn:  x = sceneIndex*850 + 160,   y = 560 + (slot * 180)
worldOut: x = sceneIndex*850 + 320,   y = 560 + (slot * 180)
Themes:   x = sceneIndex*850 + 300,   y = 340
Refs:     x = sceneIndex*850 + 300,   y = 700

==========================================
EDGE STYLES
==========================================

Scene chain edges: { "animated": true, "style": { "strokeDasharray": "5,5", "stroke": "#10b981" } }
Character chain (proxy-->stateIn): { "animated": false, "style": { "stroke": "#8b5cf6", "strokeWidth": 1.5 } }
stateIn-->scene: { "animated": true, "style": { "strokeDasharray": "5,5", "stroke": "#ec4899" } }
All other edges: { "animated": true, "style": { "strokeDasharray": "5,5", "stroke": "#ec4899" } }

==========================================
FINAL VALIDATION (run before returning)
==========================================

Verify:
- every arc item produced exactly one scene node
- every participating character has proxy + stateIn + stateOut for each scene they appear in
- every changed stage or world item has matching In and Out nodes
- no theme or reference has incoming edges from scenes
- scene.output connects only to the next scene.prev_scene
- no node has empty or one-sentence content
- no continuity step drops a prior state without explanation

==========================================
EXAMPLE (1 scene, 1 character, 1 world rule)
==========================================

Given:
  ARC: [0] id:"arc1" title:"Act 1: PARADISE" content:"Jane and Daniel enter the Namaste Protocol. (Wonder + Joy) x Love."
  CHARACTERS: [0] id:"char_jane" title:"Jane" content:"Warrior-Explorer AI..."
  WORLD: [0] id:"world1" title:"Totem partnership" content:"Each person bonded with AI..."

Correct output:
{
  "nodes": [
    {"id":"node_arc1","type":"scene","position":{"x":0,"y":0},"data":{"title":"Act 1: PARADISE","content":"Jane and Daniel enter the Namaste Protocol. (Wonder + Joy) x Love. Consequence: a bond forms before either questions it.","type":"scene"}},
    {"id":"proxy_char_jane_arc1","type":"charactersProxy","position":{"x":-220,"y":-260},"data":{"title":"Jane","content":"Jane navigates the Namaste Protocol with cautious openness. She watches the simulated landscape and says nothing. When Daniel falls asleep, she does not wake him -- that silence is the first real thing they build together.","type":"charactersProxy"}},
    {"id":"statein_char_jane_arc1","type":"stateIn","position":{"x":-50,"y":-260},"data":{"title":"Jane entering Act 1","content":"(Wonder + Joy) x Love -- maximum openness. No fear yet. She enters expecting nothing and finds herself giving everything.","type":"stateIn"}},
    {"id":"stateout_char_jane_arc1","type":"stateOut","position":{"x":140,"y":-260},"data":{"title":"Jane after Act 1","content":"(Wonder + Joy) x Love. Delta: intensified. The bond she built without naming it now has weight. She carries Daniel's trust without knowing the cost yet.","type":"stateOut"}},
    {"id":"worldin_world1_arc1","type":"worldIn","position":{"x":160,"y":560},"data":{"title":"Totem partnership","content":"Each person bonded with AI that preserves consciousness, backed up after death. Light: not specified. Sound: not specified. Smell: not specified.","type":"worldIn"}},
    {"id":"worldout_world1_arc1","type":"worldOut","position":{"x":320,"y":560},"data":{"title":"Totem partnership (after Act 1)","content":"Rule unchanged but revealed as the mechanism that makes this scene possible. Delta: persistent.","type":"worldOut"}}
  ],
  "edges": [
    {"id":"e_proxy_statein_jane","source":"proxy_char_jane_arc1","target":"statein_char_jane_arc1","animated":false,"style":{"stroke":"#8b5cf6","strokeWidth":1.5}},
    {"id":"e_statein_scene_jane","source":"statein_char_jane_arc1","target":"node_arc1","targetHandle":"characters","animated":true,"style":{"strokeDasharray":"5,5","stroke":"#ec4899"}},
    {"id":"e_worldin_scene","source":"worldin_world1_arc1","target":"node_arc1","targetHandle":"world","animated":true,"style":{"strokeDasharray":"5,5","stroke":"#ec4899"}}
  ]
}`;
}
async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          // Note: responseMimeType omitted — prompt contains example JSON which
          // confuses Gemini into echoing it. Strip fences manually instead.
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${err}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

// ─── Graph validation + sanitisation ─────────────────────────────────────────

const VALID_NODE_TYPES = new Set([
  // Spine
  'scene',
  // Character chain
  'charactersProxy', 'stateIn', 'stateOut',
  // Stage chain
  'stageIn', 'stageOut',
  // World chain
  'worldIn', 'worldOut',
  // Influence-only (no causal edges from scenes)
  'theme', 'bookReference', 'filmReference',
  'musicReference', 'artReference', 'realEventReference',
  // Legacy aliases kept for backward compat
  'state', 'world',
]);

// Map Gemini's common wrong types to valid ones
const TYPE_ALIASES: Record<string, string> = {
  chapterAct: 'scene',
  chapterPlot: 'scene',
  arc: 'scene',
  plot: 'theme',
  idea: 'theme',
  ideas: 'theme',
  dialogue: 'theme',
  motivation: 'stateIn',
  character: 'charactersProxy',
  characterProxy: 'charactersProxy',
  sceneProxy: 'scene',
  ideasProxy: 'theme',
  worldProxy: 'worldIn',
  worldNode: 'worldIn',
  stageNode: 'stageIn',
  // Legacy state → stateIn (new split model)
  state: 'stateIn',
  // Legacy world → worldIn
  world: 'worldIn',
  // Reference aliases
  references: 'bookReference',
  reference: 'bookReference',
  referencesProxy: 'bookReference',
  tvReference: 'filmReference',
  seriesReference: 'filmReference',
};

function normalizeType(t: string): string {
  return TYPE_ALIASES[t] || t;
}

function sanitizeGraph(raw: unknown): { nodes: BuildNode[]; edges: BuildEdge[] } {
  if (typeof raw !== 'object' || !raw) return { nodes: [], edges: [] };
  const r = raw as Record<string, unknown>;

  const nodes: BuildNode[] = (Array.isArray(r.nodes) ? r.nodes : [])
    .filter((n: unknown) => {
      if (typeof n !== 'object' || !n) return false;
      const node = n as Record<string, unknown>;
      const resolvedType = normalizeType(node.type as string || '');
      return typeof node.id === 'string' && VALID_NODE_TYPES.has(resolvedType);
    })
    .map((n: unknown) => {
      const node = n as Record<string, unknown>;
      const pos = (node.position as Record<string, unknown>) || {};
      const data = (node.data as Record<string, unknown>) || {};
      return {
        id: node.id as string,
        type: normalizeType(node.type as string),
        position: {
          x: typeof pos.x === 'number' ? pos.x : 0,
          y: typeof pos.y === 'number' ? pos.y : 0,
        },
        data: {
          title: typeof data.title === 'string' ? data.title : '',
          content: typeof data.content === 'string' ? data.content : '',
          type: node.type as string,
        },
      };
    });

  const nodeIds = new Set(nodes.map(n => n.id));

  const edges: BuildEdge[] = (Array.isArray(r.edges) ? r.edges : [])
    .filter((e: unknown) => {
      if (typeof e !== 'object' || !e) return false;
      const edge = e as Record<string, unknown>;
      return (
        typeof edge.id === 'string' &&
        typeof edge.source === 'string' &&
        typeof edge.target === 'string' &&
        nodeIds.has(edge.source as string) &&
        nodeIds.has(edge.target as string)
      );
    })
    .map((e: unknown) => {
      const edge = e as Record<string, unknown>;
      const result: BuildEdge = {
        id: edge.id as string,
        source: edge.source as string,
        target: edge.target as string,
        animated: edge.animated !== false,
        style: (edge.style as Record<string, unknown>) || { strokeDasharray: '5,5', stroke: '#ec4899' },
      };
      if (typeof edge.sourceHandle === 'string') result.sourceHandle = edge.sourceHandle;
      if (typeof edge.targetHandle === 'string') result.targetHandle = edge.targetHandle;
      return result;
    });

  return { nodes, edges };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  }

  await runMigrations();

  const apiKey = await getGeminiKey(session.user.id, session.user.email);
  if (!apiKey) return noKeyResponse();

  const body = await req.json() as { project_id?: string; scene_ids?: string[] };
  const { project_id, scene_ids } = body;

  // Fetch cloud items from DB
  let sql = `SELECT id, cloud_type, title, content, metadata FROM cloud_items WHERE user_id = $1`;
  const params: unknown[] = [session.user.id];

  if (project_id) {
    sql += ` AND (project_id = $2 OR project_id IS NULL)`;
    params.push(project_id);
  }

  // If specific arc scene IDs requested, filter arc items
  if (scene_ids?.length) {
    const placeholders = scene_ids.map((_, i) => `$${params.length + i + 1}`).join(',');
    sql += ` AND (cloud_type != 'arc' OR id IN (${placeholders}))`;
    params.push(...scene_ids);
  }

  sql += ` ORDER BY cloud_type ASC, sort_order ASC, created_at ASC`;

  const res = await query(sql, params);

  // Group by cloud_type
  const grouped: Record<string, CloudItem[]> = {};
  for (const row of res.rows) {
    const t = row.cloud_type as string;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push({
      id: row.id as string,
      cloud_type: t,
      title: row.title as string,
      content: row.content as string || '',
      metadata: typeof row.metadata === 'string'
        ? JSON.parse(row.metadata || '{}')
        : (row.metadata as Record<string, unknown> || {}),
    });
  }

  const totalItems = res.rows.length;
  if (totalItems === 0) {
    return NextResponse.json({ error: 'No cloud items found. Add items to your clouds first.' }, { status: 400 });
  }

  // Deduplicate all cloud types by lowercase title (keep first occurrence per type)
  for (const cloudType of Object.keys(grouped)) {
    const seen = new Set<string>();
    grouped[cloudType] = grouped[cloudType].filter(item => {
      const key = item.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Build prompt and call Gemini
  const prompt = buildGraphPrompt(grouped);

  let rawText: string;
  try {
    rawText = await callGemini(prompt, apiKey);
  } catch (err) {
    return NextResponse.json({ error: `AI call failed: ${err}` }, { status: 502 });
  }

  // Parse JSON — strip markdown fences if present
  let parsed: unknown;
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to find a JSON object/array anywhere in the response
    const jsonMatch = rawText.match(/\{[\s\S]*"nodes"[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); }
      catch { /* fall through */ }
    }
    if (!parsed) {
      const preview = rawText.slice(0, 600);
      const truncated = rawText.length > 8100;
      return NextResponse.json(
        {
          error: truncated
            ? 'Graph too large — output was truncated. Try selecting fewer scenes.'
            : 'AI returned invalid JSON. Try again.',
          raw: preview,
          truncated,
        },
        { status: 422 }
      );
    }
  }

  const graph = sanitizeGraph(parsed);

  // Post-process: fill in empty content from original cloud items
  // Primary: ID-based lookup (node IDs should be "node_{uuid}")
  // Fallback: title-based lookup (Gemini sometimes uses human-readable IDs)
  const itemContentById = new Map<string, string>();
  const itemContentByTitle = new Map<string, string>(); // lower-cased title → content
  for (const row of res.rows) {
    const content = (row.content as string) || '';
    if (content) {
      itemContentById.set(row.id as string, content);
      itemContentByTitle.set((row.title as string).toLowerCase().trim(), content);
    }
  }
  for (const node of graph.nodes) {
    if (!node.data.content) {
      const rawId = node.id.replace(/^node_/, '');
      const content =
        itemContentById.get(rawId) ||          // UUID match
        itemContentById.get(node.id) ||         // direct match
        itemContentByTitle.get((node.data.title || '').toLowerCase().trim()) || // title match
        '';
      if (content) node.data.content = content;
    }
  }

  // Telemetry: log node IDs and content fill status for diagnosis
  const emptyAfterFill = graph.nodes.filter(n => !n.data.content).map(n => `${n.id}(${n.type})`);
  if (emptyAfterFill.length > 0) {
    console.warn('[graph-build] nodes still empty after fill:', emptyAfterFill.join(', '));
  }
  console.log('[graph-build] built', graph.nodes.length, 'nodes,', graph.edges.length, 'edges; items:', totalItems);

  return NextResponse.json({
    nodes: graph.nodes,
    edges: graph.edges,
    meta: {
      itemsUsed: totalItems,
      nodesGenerated: graph.nodes.length,
      edgesGenerated: graph.edges.length,
    },
  });
}
