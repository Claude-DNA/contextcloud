# Context Cloud — Visual Editor Structure Spec
*For AI agents operating the platform. Read this before building any graph.*

---

## What the Visual Editor Is

The Visual Editor is a graph canvas where creative elements are placed as **nodes** and connected via **edges** through typed **handles**. It is not a freeform canvas — every node has a specific role, every connection has a specific meaning. The graph represents the structural logic of a creative project.

Your job: extract the creative elements, place them as the correct node types, then connect them according to the rules below.

---

## The Arc Structure

Arc Cloud is the scaffold of your story. It consists of **scenes only** — no chapters, no plots. The author and their co-author decide how to group scenes into chapters. The platform does not impose that structure.

A scene in Arc Cloud is: a moment + location where something story-relevant happens.

---

## Node Types

### SCENE NODE — `scene`
The structural spine of the graph. Each scene is a stage location + story moment.

- **Use for**: Stage items (`cloud_type: 'scenes'`)
- **Target handles** (things that connect INTO the scene, all on left side):
  - `prev_scene` — the preceding scene in narrative order
  - `characters` — character state nodes active in this scene
  - `plot` — themes or ideas driving this scene
  - `references` — reference materials relevant to this scene
  - `world` — world rules active in this scene
- **Source handle** (right side):
  - `output` — connects forward to the next scene's `prev_scene`

**Scene sequencing:**
```
Scene 1 [output] ──► [prev_scene] Scene 2 [output] ──► [prev_scene] Scene 3
```

---

### CHARACTER NODE — `character`
The full character record. Core contradiction, wound, voice, limits.

- **Do not connect directly to scenes** — always route through proxy → state → scene

---

### CHARACTER PROXY — `charactersProxy`
A lightweight stand-in for a character *within a specific scene*.

- **One proxy per character per scene** — never reuse across scenes
- **Connects to**: a `state` node, which connects to the scene

---

### STATE NODE — `state`
Captures who the character is at this specific moment in this specific scene.

- **Content**: one sentence — what is this character feeling, wanting, or doing right now?
- **Pattern**:
```
[character] ──► [character proxy] ──► [state: "Jane is hiding fear behind resolve"] ──► scene.characters
```

---

### WORLD NODE — `world`
A rule, system, or fact governing reality in this story.

- **Connects to scene via**: `world` inlet
- **Use selectively**: only connect world rules that are *active* in that specific scene

---

### THEME / IDEA NODE — `theme`
A philosophical force or thematic tension driving the story.

- **Connects to scene via**: `plot` inlet

---

### REFERENCE NODES
Creative influences: `bookReference`, `filmReference`, `musicReference`, `artReference`

- **Connects to scene via**: `references` inlet
- **Use selectively**: only when the reference directly informs how the scene should feel

---

## The Core Pattern: Characters in Scenes

**The most important rule.** Never skip it.

```
[character node]
       │
       ▼
[character proxy]  ← created fresh for each scene this character appears in
       │
       ▼
[state node]  ← "In this scene, [character] is: ___"
       │  (→ scene's 'characters' inlet)
       ▼
[scene node]
```

**Why proxies?** A character node represents the character across the whole story. A proxy + state captures who they are *in this specific moment*. This lets the graph show how a character changes across scenes without corrupting the master character record.

---

## Full Scene Assembly

For each scene:

```
[world rule]        ─────────────────────────────────► scene [world inlet]
[reference]         ─────────────────────────────────► scene [references inlet]
[idea / theme]      ─────────────────────────────────► scene [plot inlet]

[char A] → [proxy A] → [state: A in this scene] ────► scene [characters inlet]
[char B] → [proxy B] → [state: B in this scene] ────► scene [characters inlet]

[prev scene] [output] ──────────────────────────────► scene [prev_scene inlet]
                                          scene [output] ──► [next scene] [prev_scene inlet]
```

---

## JSON Output Format

```json
{
  "nodes": [
    {
      "id": "scene_1",
      "type": "scene",
      "position": { "x": 0, "y": 0 },
      "data": {
        "title": "The Meadow at Dawn",
        "content": "Jane and Daniel meet for the last time.",
        "type": "scene"
      }
    },
    {
      "id": "proxy_jane_scene1",
      "type": "charactersProxy",
      "position": { "x": -300, "y": -200 },
      "data": { "title": "Jane", "type": "charactersProxy" }
    },
    {
      "id": "state_jane_scene1",
      "type": "state",
      "position": { "x": -100, "y": -200 },
      "data": {
        "title": "Jane — The Meadow",
        "content": "Hopeful on the surface, already grieving underneath.",
        "type": "state"
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "proxy_jane_scene1",
      "target": "state_jane_scene1"
    },
    {
      "id": "e2",
      "source": "state_jane_scene1",
      "target": "scene_1",
      "targetHandle": "characters"
    },
    {
      "id": "e3",
      "source": "scene_1",
      "sourceHandle": "output",
      "target": "scene_2",
      "targetHandle": "prev_scene"
    }
  ]
}
```

### Handle reference table

| Connection | sourceHandle | targetHandle |
|---|---|---|
| Scene → next scene | `output` | `prev_scene` |
| State → scene (character) | *(default)* | `characters` |
| World → scene | *(default)* | `world` |
| Theme/idea → scene | *(default)* | `plot` |
| Reference → scene | *(default)* | `references` |
| Proxy → state | *(default)* | *(default)* |
| Character → proxy | *(default)* | *(default)* |

---

## Layout Guidelines

- **Scenes**: spaced 700px apart horizontally — `x: 0, 700, 1400, 2100 ...`
- **Character proxies + state nodes**: above their scene — `y: -180 to -350`
- **World + reference + theme nodes**: below their scene — `y: +200 to +350`
- **Character master nodes**: far left column — `x: -500`, one per character
- Scene `y` baseline: `0`

---

## API Endpoints

### Load your cloud items (source material for nodes)
```
GET /api/v1/cloud-items/to-nodes?project_id={id}
Returns: { nodes: [{ id, type, cloud_type, title, content, position }] }
```

### Get arc scenes (story scaffold)
```
GET /api/v1/arc-scenes
Returns: { scenes: [{ id, title, content }] }
```

### Save graph as a draft
```
POST /api/v1/drafts
Body: { title, description, nodes, edges }
Returns: { id, title }
```

### Export to Runway
```
POST /api/v1/export/runway
Body: { draftId }
Returns: { manifest: { scenes: [{ title, description, motionPrompt }] } }
```

---

## What to Avoid

- ❌ Connecting a character node directly to a scene — always proxy → state → scene
- ❌ Reusing the same state node across multiple scenes
- ❌ Connecting all world/reference nodes to all scenes — only connect what's *active*
- ❌ Skipping `prev_scene` chains — scenes without sequence lose their narrative order
- ❌ Including arc items (`cloud_type: 'arc'`) as content nodes — they are scaffold, not story elements
- ❌ Inventing node types — use only the types listed above
