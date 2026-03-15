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

  return `You are a story graph builder. Your task: take the creative cloud items below and build a connected visual graph following strict structural rules.

OUTPUT: A single JSON object with two arrays: "nodes" and "edges". Nothing else — no explanation, no markdown, just the JSON.

════════════════════════════════
CLOUD ITEMS (your input material)
════════════════════════════════

ARC SCENES (these become the graph's spine — one scene node each, in order):
${arcScenes.length ? formatList(arcScenes) : '  (none)'}

CHARACTERS (used to decide who appears in each scene — create proxy+state pairs ONLY, NO master character nodes):
${characters.length ? formatList(characters) : '  (none)'}

STAGE LOCATIONS (connect to relevant scenes via world inlet):
${stages.length ? formatList(stages) : '  (none)'}

WORLD RULES (connect to relevant scenes via world inlet):
${worldItems.length ? formatList(worldItems) : '  (none)'}

THEMES / IDEAS (connect to relevant scenes via plot inlet):
${ideas.length ? formatList(ideas) : '  (none)'}

REFERENCES (connect to relevant scenes via references inlet):
${references.length ? formatList(references) : '  (none)'}

════════════════════════════════
STRUCTURAL RULES — follow exactly
════════════════════════════════

1. SCENE NODES
   - One scene node per arc scene item, in the same order
   - node type: "scene"
   - Use the arc scene's id as the node id (prefix with "node_")
   - Scenes chain together: scene1.output → scene2.prev_scene → scene3.prev_scene ...

2. CHARACTER PROXY + STATE PATTERN (mandatory for every character in every scene)
   - Do NOT create standalone "character" type master nodes. The proxy IS the character representation.
   - Decide which characters appear in each scene based on content clues
   - For each character-scene pairing, create TWO nodes:
     a) charactersProxy node: id = "proxy_{charId}_{sceneId}", title = character name
        data.content = 3-4 sentences describing the character's SPECIFIC ROLE AND ACTIONS in this scene.
        Include: what they do, what they discover or decide, how they interact with others,
        and one concrete detail from the arc item's content. Never just one sentence.
     b) state node: id = "state_{charId}_{sceneId}", title = "{CharName} — {SceneTitle}"
        data.content = character's emotional state in this scene.
        LOOK at the arc item's content for formulas like "(Wonder + Joy) × Love".
        If a formula exists, include it VERBATIM as the first line, then 2 sentences about what it feels like internally.
        If no formula exists, write 3 sentences: emotional state, inner conflict, what they want.
        NEVER leave state data.content empty. NEVER write just one sentence.
   - Connect: proxy → state → scene (targetHandle: "characters")
   - NEVER create a "character" type node. NEVER create a character → proxy edge. The chain starts at proxy.
   - If no clear characters for a scene, use the 1-2 most relevant ones

3. WORLD + STAGE CONNECTIONS
   - Connect stage location nodes to the scenes they most likely take place in (targetHandle: "world")
   - Connect world rule nodes to scenes where that rule is relevant (targetHandle: "world")
   - Be selective — do NOT connect every world item to every scene

4. THEME + IDEA CONNECTIONS
   - Connect idea/theme nodes to scenes where that theme is most active (targetHandle: "plot")
   - Typically 1-2 themes per scene

5. REFERENCE CONNECTIONS
   - Connect reference nodes only to scenes they most directly inform (targetHandle: "references")
   - If unclear, skip the connection

════════════════════════════════
NODE TYPE REFERENCE — USE ONLY THESE EXACT STRINGS
════════════════════════════════

"scene"          — for arc scenes (the spine)
"charactersProxy"— for characters in a scene (this is the ONLY character node type — no master nodes)
"state"          — for character emotional state in a scene
"world"          — for world rules AND stage locations
"theme"          — for ideas and themes
"bookReference"  — for book references
"filmReference"  — for film references
"musicReference" — for music references
"artReference"   — for art references
"realEventReference" — for real event references

CRITICAL: Do NOT use "chapterAct", "arc", "plot", "chapterPlot", "characterProxy", or any other type.
Only the 11 types listed above are valid. Any other type string will be rejected.
Arc scenes MUST use type "scene" — not "chapterAct", not "arc".

════════════════════════════════
HANDLE REFERENCE
════════════════════════════════

| connection                    | sourceHandle | targetHandle  |
|-------------------------------|--------------|---------------|
| scene → next scene            | "output"     | "prev_scene"  |
| state → scene                 | (none)       | "characters"  |
| world/stage → scene           | (none)       | "world"       |
| theme → scene                 | (none)       | "plot"        |
| reference → scene             | (none)       | "references"  |
| proxy → state                 | (none)       | (none)        |

Note: There is NO character master node. Proxy nodes are the starting point of the chain.

(none) means omit the handle field from the edge object entirely.

════════════════════════════════
LAYOUT RULES
════════════════════════════════

- Scene nodes: x = sceneIndex * 750, y = 0
- For each scene (sceneIndex), character proxies/states ABOVE the scene:
    proxy: x = sceneIndex * 750 - 200, y = -240 - (charSlot * 180)
    state: x = sceneIndex * 750 - 30, y = -240 - (charSlot * 180)
- World/stage nodes: BELOW scenes, x = sceneIndex * 750, y = 320 + (itemSlot * 160)
- Theme nodes: BELOW scenes, x = sceneIndex * 750 + 140, y = 320 + (itemSlot * 160)
- Reference nodes: x = sceneIndex * 750 + 260, y = 520

════════════════════════════════
EDGE STYLE
════════════════════════════════

All edges: { "animated": true, "style": { "strokeDasharray": "5,5", "stroke": "#ec4899" } }
Exception — character→proxy and proxy→state edges: { "animated": false, "style": { "stroke": "#8b5cf6", "strokeWidth": 1.5 } }

════════════════════════════════
EXAMPLE — 1 arc scene, 2 characters, 1 world rule
════════════════════════════════

Given:
- ARC SCENES: [0] id:"arc1" title:"Act 1: The Meeting"
- CHARACTERS: [0] id:"char_jane" title:"Jane"  [1] id:"char_dan" title:"Daniel"
- WORLD RULES: [0] id:"world1" title:"Zero-G Biology"

Correct output (NO character master nodes — proxy is the starting point):
{
  "nodes": [
    {"id":"node_arc1","type":"scene","position":{"x":0,"y":0},"data":{"title":"Act 1: The Meeting","content":"Daniel and Jane enter a simulated shared experience designed to build genuine bonds through the Namaste Protocol. Jane watches the alien landscape in silence, trusting the space more than words. Daniel falls asleep — an unconscious act of trust he won't understand until much later. The bond forms before either of them questions it.","type":"scene"}},
    {"id":"proxy_char_jane_arc1","type":"charactersProxy","position":{"x":-200,"y":-240},"data":{"title":"Jane","content":"Jane navigates the simulated shared space with quiet attention — she watches the alien landscape scroll past, says nothing, and does not reach out. She trusts the silence between them more than words. When Daniel falls asleep, she doesn't wake him. That choice is the first real thing they build together.","type":"charactersProxy"}},
    {"id":"state_char_jane_arc1","type":"state","position":{"x":-30,"y":-240},"data":{"title":"Jane — Act 1","content":"(Wonder + Joy) × Love — maximum openness. Jane holds no defenses here. The simulated space asks nothing of her except presence, and she gives it completely. For once, connection does not feel like a transaction — it just is.","type":"state"}},
    {"id":"proxy_char_dan_arc1","type":"charactersProxy","position":{"x":-200,"y":-420},"data":{"title":"Daniel","content":"Daniel spends most of Act 1 watching rather than speaking — he observes the landscape, observes Jane, and somewhere between the two he falls asleep. It is an unconscious act of trust: he stops performing alertness and simply rests. He doesn't know until much later that Jane was why he felt safe enough to do it.","type":"charactersProxy"}},
    {"id":"state_char_dan_arc1","type":"state","position":{"x":-30,"y":-420},"data":{"title":"Daniel — Act 1","content":"(Wonder + Joy) × Love — maximum openness. Daniel doesn't name what he feels, but his body knows it — the stillness, the sleep that comes without effort. The formula is running at full strength and he has no defenses against it. He will only understand what happened here in retrospect.","type":"state"}},
    {"id":"node_world1","type":"world","position":{"x":0,"y":320},"data":{"title":"Zero-G Biology","content":"Biological expansion in zero-g behaves differently than calculated. Neither side asked before acting.","type":"world"}}
  ],
  "edges": [
    {"id":"e_proxy_state_jane","source":"proxy_char_jane_arc1","target":"state_char_jane_arc1","animated":false,"style":{"stroke":"#8b5cf6","strokeWidth":1.5}},
    {"id":"e_state_jane_scene","source":"state_char_jane_arc1","target":"node_arc1","targetHandle":"characters","animated":true,"style":{"strokeDasharray":"5,5","stroke":"#ec4899"}},
    {"id":"e_proxy_state_dan","source":"proxy_char_dan_arc1","target":"state_char_dan_arc1","animated":false,"style":{"stroke":"#8b5cf6","strokeWidth":1.5}},
    {"id":"e_state_dan_scene","source":"state_char_dan_arc1","target":"node_arc1","targetHandle":"characters","animated":true,"style":{"strokeDasharray":"5,5","stroke":"#ec4899"}},
    {"id":"e_world_scene","source":"node_world1","target":"node_arc1","targetHandle":"world","animated":true,"style":{"strokeDasharray":"5,5","stroke":"#ec4899"}}
  ]
}

Note: No "hub_source" handles. Edges connect to named targetHandles: "characters", "world", "plot", "references".

════════════════════════════════
CONTENT RULE — CRITICAL
════════════════════════════════

For scene, world, theme, reference nodes: copy the full "content" field from the cloud item into "data.content".
NEVER leave "data.content" as an empty string "". NEVER use "..." as a placeholder. NEVER write just one sentence.
If the cloud item has content, use it verbatim (it may be long — keep all of it).
If it has none, write 3-4 sentences synthesizing what's known from context.

For charactersProxy and state nodes: you are GENERATING the content (not copying from cloud items).
- charactersProxy: 3-4 sentences about the character's specific actions/choices/discoveries in this scene.
- state: formula (if one exists in the arc content) + 2-3 sentences about what the state feels like from inside.

════════════════════════════════
OUTPUT FORMAT
════════════════════════════════

{
  "nodes": [
    {
      "id": "node_ORIGINAL_ID",
      "type": "scene",
      "position": { "x": 0, "y": 0 },
      "data": { "title": "Scene Title", "content": "Full content from the cloud item — never empty.", "type": "scene" }
    }
  ],
  "edges": [
    {
      "id": "e_scene0_scene1",
      "source": "node_SCENE0_ID",
      "sourceHandle": "output",
      "target": "node_SCENE1_ID",
      "targetHandle": "prev_scene",
      "animated": true,
      "style": { "strokeDasharray": "5,5", "stroke": "#ec4899" }
    }
  ]
}

Important:
- Output ONLY the JSON object. No surrounding text, no markdown code fences.
- Every id must be unique.
- Include ALL arc scenes as scene nodes, ALL characters as character nodes.
- Generate proxies + states for character-scene pairings you judge as relevant.
- If arcScenes list is empty, build the best structure you can from the other items.`;
}

// ─── Gemini call ──────────────────────────────────────────────────────────────

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,       // low temperature = more deterministic JSON
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
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
  'scene', 'charactersProxy', 'state',
  'world', 'theme', 'bookReference', 'filmReference',
  'musicReference', 'artReference', 'realEventReference',
  // 'character' intentionally excluded — proxies replace masters in auto-build
]);

// Map Gemini's common wrong types to valid ones
const TYPE_ALIASES: Record<string, string> = {
  chapterAct: 'scene',
  chapterPlot: 'scene',
  arc: 'scene',
  plot: 'theme',
  dialogue: 'theme',
  motivation: 'state',
  character: 'charactersProxy',   // master character nodes → proxies
  characterProxy: 'charactersProxy',
  sceneProxy: 'scene',
  ideasProxy: 'theme',
  worldProxy: 'world',
  referencesProxy: 'bookReference',
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

  // Parse JSON
  let parsed: unknown;
  try {
    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: 'AI returned invalid JSON. Try again.', raw: rawText.slice(0, 500) },
      { status: 422 }
    );
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
