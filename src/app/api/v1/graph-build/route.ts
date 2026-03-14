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
    list.map((i, idx) => `  [${idx}] id:"${i.id}" title:"${i.title}" content:"${i.content?.slice(0, 200) || ''}"`).join('\n');

  return `You are a story graph builder. Your task: take the creative cloud items below and build a connected visual graph following strict structural rules.

OUTPUT: A single JSON object with two arrays: "nodes" and "edges". Nothing else — no explanation, no markdown, just the JSON.

════════════════════════════════
CLOUD ITEMS (your input material)
════════════════════════════════

ARC SCENES (these become the graph's spine — one scene node each, in order):
${arcScenes.length ? formatList(arcScenes) : '  (none)'}

CHARACTERS (these become character nodes + proxies per scene):
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
   - Decide which characters appear in each scene based on content clues
   - For each character-scene pairing, create TWO new nodes:
     a) charactersProxy node: id = "proxy_{charId}_{sceneId}"
     b) state node: id = "state_{charId}_{sceneId}"
        content = one sentence: what is this character feeling/doing/wanting in THIS scene?
   - Connect: character → proxy → state → scene (targetHandle: "characters")
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
NODE TYPE REFERENCE
════════════════════════════════

| type              | use for                        |
|-------------------|--------------------------------|
| scene             | arc scene (spine)              |
| character         | full character record          |
| charactersProxy   | character stand-in per scene   |
| state             | character state in a scene     |
| world             | world rule or stage location   |
| theme             | idea or theme                  |
| bookReference     | book reference                 |
| filmReference     | film reference                 |
| musicReference    | music reference                |
| artReference      | art reference                  |

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
| character → proxy             | (none)       | (none)        |
| proxy → state                 | (none)       | (none)        |

(none) means omit the handle field from the edge object entirely.

════════════════════════════════
LAYOUT RULES
════════════════════════════════

- Scene nodes: x = sceneIndex * 750, y = 0
- Character master nodes: x = -550, y = charIndex * 180, stacked vertically
- For each scene (sceneIndex), character proxies/states above the scene:
    proxy: x = sceneIndex * 750 - 180, y = -220 - (charSlot * 160)
    state: x = sceneIndex * 750 - 20, y = -220 - (charSlot * 160)
- World/stage nodes: below scenes, x = sceneIndex * 750, y = 300 + (itemSlot * 160)
- Theme nodes: below scenes, x = sceneIndex * 750 + 120, y = 300 + (itemSlot * 160)
- Reference nodes: x = sceneIndex * 750 + 220, y = 500

════════════════════════════════
EDGE STYLE
════════════════════════════════

All edges: { "animated": true, "style": { "strokeDasharray": "5,5", "stroke": "#ec4899" } }
Exception — character→proxy and proxy→state edges: { "animated": false, "style": { "stroke": "#8b5cf6", "strokeWidth": 1.5 } }

════════════════════════════════
OUTPUT FORMAT
════════════════════════════════

{
  "nodes": [
    {
      "id": "node_ORIGINAL_ID",
      "type": "scene",
      "position": { "x": 0, "y": 0 },
      "data": { "title": "Scene Title", "content": "Scene description.", "type": "scene" }
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
  'scene', 'character', 'charactersProxy', 'state',
  'world', 'theme', 'bookReference', 'filmReference',
  'musicReference', 'artReference',
]);

function sanitizeGraph(raw: unknown): { nodes: BuildNode[]; edges: BuildEdge[] } {
  if (typeof raw !== 'object' || !raw) return { nodes: [], edges: [] };
  const r = raw as Record<string, unknown>;

  const nodes: BuildNode[] = (Array.isArray(r.nodes) ? r.nodes : [])
    .filter((n: unknown) => {
      if (typeof n !== 'object' || !n) return false;
      const node = n as Record<string, unknown>;
      return typeof node.id === 'string' && VALID_NODE_TYPES.has(node.type as string);
    })
    .map((n: unknown) => {
      const node = n as Record<string, unknown>;
      const pos = (node.position as Record<string, unknown>) || {};
      const data = (node.data as Record<string, unknown>) || {};
      return {
        id: node.id as string,
        type: node.type as string,
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
