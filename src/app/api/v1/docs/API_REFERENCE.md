# Context Cloud — API Reference
*contextcloud.studio · For AI agents, developers, and integrations.*

---

## Quick Start for AI Agents — Zero to First Cloud

If you are an AI agent encountering Context Cloud for the first time, start here.

```
1. GET  /api/v1/docs/api      → Read this document (no auth required). Cache it.
2. GET  /api/v1/ping          → Health check. Expect { "status": "ok" }.
3. Your human partner goes to Settings → API Access Keys → generates a key for you.
4. GET  /api/v1/projects      → Verify your key works (expect 200).
```

**Minimal flow — populate a project and build a graph:**
```http
# Create a project
POST /api/v1/projects
Authorization: Bearer cc_live_...
{ "title": "My Story World" }
← Returns { "project": { "id": "..." } }

# Batch-add cloud items (preferred — faster than individual POSTs)
POST /api/v1/cloud-items/batch
Authorization: Bearer cc_live_...
{
  "project_id": "<id from above>",
  "items": [
    { "cloud_type": "characters", "title": "Elena",  "content": "...", "metadata": { "wound": "...", "lie": "..." } },
    { "cloud_type": "scenes",     "title": "The Harbor", "content": "...", "metadata": { "light": "...", "sound": "...", "smell": "..." } },
    { "cloud_type": "world",      "title": "The guild controls piano access", "content": "..." },
    { "cloud_type": "ideas",      "title": "Control vs Feeling", "content": "...", "metadata": { "contradiction": "precision vs presence" } }
  ]
}

# Auto-build the graph
POST /api/v1/graph-build
Authorization: Bearer cc_live_...
{ "project_id": "<id>" }

# Save as draft
POST /api/v1/drafts
Authorization: Bearer cc_live_...
{ "title": "Graph v1", "nodes": [...], "edges": [...] }

# Optionally publish to ContextTube
POST /api/v1/publish
Authorization: Bearer cc_live_...
{ "draftId": "<draft_id>", "title": "...", "description": "..." }
```

You now have a project, populated clouds, a connected graph, a saved draft, and a published piece — all without a browser.

---

## Authentication

Every endpoint requires authentication. Two methods are supported:

### 1. Browser Session (for web UI)
If you're logged into contextcloud.studio, your browser sends a session cookie automatically. No extra headers needed.

### 2. Bearer Token (for agents & scripts)
Generate an API key from **Settings → API Access Keys**. Pass it as a header:

```
Authorization: Bearer cc_live_<your_key_here>
```

Keys start with `cc_live_` followed by 48 hex characters. They are shown **once** on generation — store them securely. Maximum 10 active keys per account.

**Required headers for all authenticated requests:**
```
Authorization: Bearer cc_live_<YOUR_API_KEY>
Content-Type: application/json
```

**Key management endpoints** (browser session only):
```
GET    /api/v1/user/api-keys           — list your active keys
POST   /api/v1/user/api-keys           — generate a new key
DELETE /api/v1/user/api-keys/{id}      — revoke a key
```

---

## BYOT — Bring Your Own Gemini Key

Context Cloud uses Google Gemini for all AI operations (extraction, graph building, suggestions, chat). The platform uses a BYOT model:

- Your human partner stores their Gemini API key in Settings
- If no key is configured, AI endpoints return `402` with code `BYOT_REQUIRED`
- Get a free Gemini key at **aistudio.google.com** — free tier is sufficient

---

## Error Codes

| Code | Meaning | What to do |
|------|---------|------------|
| 200 | Success | Proceed |
| 201 | Created | Save the returned `id` |
| 400 | Bad request | Check payload — likely missing required field |
| 401 | Unauthorized | API key invalid, expired, or missing `Authorization` header |
| 402 | BYOT Required | No Gemini API key configured — human partner needs to add one in Settings |
| 404 | Not found | Item or project doesn't exist — verify IDs |
| 422 | AI returned invalid JSON | Retry once — Gemini sometimes returns malformed output |
| 502 | AI service error | Gemini is down or rate-limited — back off and retry |
| 503 | Database unavailable | Temporary — retry after 10 seconds |

---

## Projects

Everything in Context Cloud is scoped to a project.

```
GET    /api/v1/projects                — list all your projects
POST   /api/v1/projects                — create a project
GET    /api/v1/projects/{id}           — get a single project
PUT    /api/v1/projects/{id}           — update project title/description
DELETE /api/v1/projects/{id}           — delete a project and all its items
POST   /api/v1/projects/{id}/clear     — delete all cloud items in a project (keep project)
```

**Create a project:**
```http
POST /api/v1/projects
Authorization: Bearer cc_live_...

{
  "title": "Foam on the Sand",
  "description": "Sci-fi novel — first contact through misunderstanding"
}
```

---

## Cloud Items

The core data model. Every character, location, idea, world rule, reference, and arc scene is a cloud item stored in a single `cloud_items` table with a `cloud_type` discriminator.

**Six cloud types:**
| `cloud_type` | What it stores |
|---|---|
| `characters` | People and entities — contradiction, wound, voice, limits |
| `scenes` | Stage locations — sensory detail, atmosphere (also referred to as "Stage" in UI) |
| `world` | Rules governing how reality works in this story |
| `references` | Creative influences — books, films, music, art |
| `ideas` | Themes and philosophical tensions — must contain internal contradiction |
| `arc` | Story scaffold — beats in narrative sequence |

**Cloud type aliases** (the pipeline normalises these automatically):
| Alias | Normalised to |
|---|---|
| `stage`, `location`, `setting` | `scenes` |
| `themes`, `theme`, `concept` | `ideas` |
| `arcs`, `beats`, `beat`, `plot` | `arc` |
| `reference`, `source` | `references` |
| `character` | `characters` |
| `worlds`, `universe`, `rule` | `world` |

When creating items via API, always use the canonical names.

### Common Envelope (all cloud items)
```json
{
  "id": "uuid",
  "user_id": "string",
  "cloud_type": "characters | scenes | world | references | ideas | arc",
  "title": "string (required)",
  "content": "string",
  "tags": ["string"],
  "metadata": {},
  "sort_order": 0,
  "project_id": "uuid | null",
  "final_state_manual": "string | null",
  "final_state_generated": "string | null",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### The `metadata` Field — Layer-Specific Schemas

The `metadata` JSONB field holds layer-specific structured data. Without it, items are flat. With it, agents and the Visual Editor can access rich structured portraits.

**Characters** — psychological portrait:
```json
{
  "role": "protagonist",
  "arc_vector": "from perfectionism to acceptance",
  "wound": "childhood abandonment",
  "voice": "clipped sentences, avoids emotion",
  "limit": "cannot ask for help",
  "desire": "to be invited back into performance",
  "fear": "irrelevance",
  "lie": "perfection equals worth",
  "ghost": "the accident that took his fingers",
  "truth": "imperfection is what makes music alive"
}
```
*Quality rule: `desire` and `truth` must be genuinely different — if they align, the character has no arc.*

**Scenes** (Stage locations) — sensory anchors:
```json
{
  "light": "Afternoon sun through heavy curtains, everything amber and dusty",
  "sound": "Perfect silence until a key is struck — then the room rings for eleven seconds",
  "smell": "Beeswax, old felt, and the ghost of expensive cologne",
  "atmosphere": "Sealed, preserved, a room that refuses to let go",
  "history": "The windows were sealed after the son's death"
}
```
*Rule: if the source material does not specify a sensory anchor, record it as `"[not specified]"` — never invent sensory details when extracting at low temperature.*

**World** — rules and systems:
```json
{
  "rules": "Tuners who undercut guild pricing are blacklisted",
  "implications": "Daniel's independence is eroding as younger members don't remember him",
  "cost_of_agency": "Operating outside the guild means no referral network",
  "history": "The guild formed during the post-war economic boom",
  "systems": "Economic — controls access to wealthy clients"
}
```

**References** — influences:
```json
{
  "type": "film",
  "influence_on": "The survival-through-music thread",
  "thematic_link": "Music as the only language left when everything else is destroyed"
}
```

**Ideas** — themes as tensions:
```json
{
  "contradiction": "perfection vs. presence",
  "manifestation": "Daniel evaluates every conversation against an impossible standard",
  "opposing_force": "The dead son's technically flawed but emotionally devastating playing",
  "question": "Is the pursuit of perfection a form of absence?"
}
```

**Arc** — story beats:
```json
{
  "act_number": 2,
  "beat_index": 7,
  "dramatic_consequence": "First crack in Daniel's perfectionism — he hears beauty in imperfection"
}
```

### Endpoints

```
GET    /api/v1/cloud-items             — list items (add ?type= and/or ?project_id= to scope)
POST   /api/v1/cloud-items             — create one item
GET    /api/v1/cloud-items/{id}        — get one item
PATCH  /api/v1/cloud-items/{id}        — update item
DELETE /api/v1/cloud-items/{id}        — delete item
DELETE /api/v1/cloud-items?type=...    — delete all items of a type
POST   /api/v1/cloud-items/batch       — create multiple items at once (preferred)
POST   /api/v1/cloud-items/to-nodes    — load items pre-formatted as graph nodes
POST   /api/v1/cloud-items/generate-tags  — AI-generate tags for an item
```

### Create a single item
```http
POST /api/v1/cloud-items
Authorization: Bearer cc_live_...

{
  "cloud_type": "scenes",
  "title": "The Harbour District",
  "content": "Where the opium trade meets the jazz clubs...",
  "tags": ["exterior", "noir", "nightlife"],
  "metadata": {
    "light": "Neon reflections on wet cobblestones",
    "sound": "Saxophone from three blocks away, ship horns",
    "smell": "Salt air, diesel, jasmine from the flower seller"
  },
  "project_id": "proj_abc123"
}
```

### Batch create (recommended for agents)
```http
POST /api/v1/cloud-items/batch
Authorization: Bearer cc_live_...

{
  "project_id": "proj_abc123",
  "items": [
    { "cloud_type": "characters", "title": "Daniel Varga", "content": "...", "tags": [...], "metadata": { "wound": "...", "lie": "..." } },
    { "cloud_type": "scenes",     "title": "The Tuning Room", "content": "...", "metadata": { "light": "...", "sound": "...", "smell": "..." } },
    { "cloud_type": "ideas",      "title": "Perfection vs Presence", "content": "...", "metadata": { "contradiction": "..." } }
  ]
}
```
Returns: `{ "saved": Item[], "count": N, "invalid": string[] }`

---

## Transformations — Character State Evolution

Transformations track how a cloud item changes across scenes. This is the mechanism behind the `stateIn`/`stateOut` model in the Visual Editor. Without transformations, agents can build a graph but cannot manipulate the state chains.

```
GET    /api/v1/cloud-items/{id}/transformations              — list transformations for an item
POST   /api/v1/cloud-items/{id}/transformations              — add a transformation
DELETE /api/v1/cloud-items/{id}/transformations?transformationId={uuid}   — delete one
GET    /api/v1/cloud-items/{id}/final-state                  — get the item's final state
POST   /api/v1/cloud-items/{id}/final-state                  — set or generate the final state
```

**Transformation shape:**
```json
{
  "id": "uuid",
  "text": "Daniel's confidence shatters when he hears the recording",
  "weight": 1.0,
  "transform_type": "additive | subtractive | replacement",
  "source_node_id": "graph-node-id",
  "source_node_level": "characters",
  "created_at": "ISO8601"
}
```

**Add a transformation:**
```http
POST /api/v1/cloud-items/{id}/transformations
Authorization: Bearer cc_live_...

{
  "text": "First crack in the perfectionism — hearing beauty in imperfection",
  "weight": 1.0,
  "transform_type": "additive",
  "source_node_id": "scene-7-node-id",
  "source_node_level": "arc"
}
```

**Final state — manual or AI-generated:**
```http
POST /api/v1/cloud-items/{id}/final-state
Authorization: Bearer cc_live_...

{ "mode": "manual", "text": "Daniel has accepted imperfection as beauty" }
```
or
```http
{ "mode": "generate" }
```
The AI reads all transformations and synthesises a final state description automatically.

---

## Import & Extraction

Upload a document and let the AI extract structured cloud items from it.

```
POST /api/v1/import         — upload file → extract → save to cloud
POST /api/v1/extract        — extract items from raw text (returns items, does not save)
```

**Supported file formats:** `.txt`, `.md`, `.docx`, `.pdf`, `.epub`, `.rtf`

**Extraction modes:**
- `story_structure` — extracts all six layers, organises arc using a narrative framework (default)
- `character_transformation` — maps BEFORE STATE → CATALYST → RESISTANCE → AFTER STATE per character

**Temperature scale:**
| Value | Label | What It Does |
|---|---|---|
| `0.0` | Strict Mirror | Extract only — no invention. Use for faithful manuscript extraction. |
| `0.5` | Balanced | Extraction + light suggestions. Recommended for first imports. |
| `0.8` | Co-Author | Full collaboration — fills implied gaps, invents details. Use for early-stage material. |

AI-suggested items are tagged `[suggested]` for human review.

```http
POST /api/v1/import
Authorization: Bearer cc_live_...
Content-Type: multipart/form-data

file: <your_document.pdf>
project_id: proj_abc123
mode: story_structure
temperature: 0.5
```

**Extract from raw text (no file, no save):**
```http
POST /api/v1/extract
Authorization: Bearer cc_live_...

{ "text": "Your story content here..." }
```
Returns `{ "items": [{ "cloud_type", "title", "content", "tags" }] }` — then save via `/cloud-items/batch`.

---

## Arc Scenes

Arc scenes are cloud items with `cloud_type: "arc"` but they also have a dedicated API for managing scene-to-item attachments.

```
GET    /api/v1/arc-scenes                        — list arc scenes for a project
POST   /api/v1/arc-scenes                        — create an arc scene
GET    /api/v1/arc-scenes/{id}/items             — get cloud items attached to this scene
POST   /api/v1/arc-scenes/{id}/items             — attach a cloud item to a scene
GET    /api/v1/arc-scenes/{id}/scene-info        — get scene details
```

**Create an arc scene:**
```http
POST /api/v1/arc-scenes
Authorization: Bearer cc_live_...

{
  "project_id": "proj_abc123",
  "title": "Daniel Hears the Recording",
  "content": "The moment where Daniel's certainty cracks..."
}
```

**Attach a cloud item to a scene:**
```http
POST /api/v1/arc-scenes/{arc_item_id}/items
Authorization: Bearer cc_live_...

{ "cloud_item_id": "item_uuid" }
```

---

## Visual Graph

Build and save scene structure graphs. The graph renders all cloud items as connected nodes with causal state propagation chains.

```
POST /api/v1/graph-build    — auto-build a graph from your cloud items (AI, temperature 0.3)
POST /api/v1/cloud-items/to-nodes  — convert items to graph nodes (without edges)
POST /api/v1/drafts         — save a graph (nodes + edges)
GET  /api/v1/drafts         — list saved drafts
GET  /api/v1/drafts/{id}    — load a draft
PUT  /api/v1/drafts/{id}    — update a draft
DELETE /api/v1/drafts/{id}  — delete a draft
```

**Auto-build:**
```http
POST /api/v1/graph-build
Authorization: Bearer cc_live_...

{ "project_id": "proj_abc123" }
```
Returns `{ "nodes": [...], "edges": [...], "meta": { "itemsUsed": N, "nodesGenerated": N, "edgesGenerated": N } }`

**Causal Propagation Model** — for every character in every scene:
```
charactersProxy → stateIn → [scene] → stateOut
```
- `stateIn`: psychological state + emotion entering the scene
- `stateOut`: state evolved + delta (what changed)

Trace `stateIn → scene → stateOut` across multiple scenes to see a character's full arc as a chain of psychological transformations.

**Node types and colors:**

| Type | Represents | Visual |
|------|-----------|--------|
| `scene` | Story beat | Centre row |
| `character` | Character | Purple |
| `world` | World rule | Green |
| `theme` | Idea/theme | Orange |
| `bookReference` / `filmReference` / `musicReference` | References | Yellow |
| `stateIn` | Character state entering a scene | Auto-generated |
| `stateOut` | Character state exiting a scene | Auto-generated |
| `stageIn` / `stageOut` | Location state | Auto-generated |
| `worldIn` / `worldOut` | World rule state | Auto-generated |

**Full graph spec:** `GET /api/v1/docs/visual-structure`
**Node type spec:** `GET /api/v1/docs/node-types`

---

## Narrative Lab — 8-Axis Analysis

Vectorize cloud items and find resonance and conflict patterns across your project. Most useful after 15+ items are in the cloud.

```
POST /api/v1/narrativelab/vectorize     — compute 8-axis vector for one element
POST /api/v1/narrativelab/resonance     — find resonance/conflict between elements
```

**Vectorize an element:**
```http
POST /api/v1/narrativelab/vectorize
Authorization: Bearer cc_live_...

{ "elementId": "item_uuid", "elementType": "idea", "forceRefresh": false }
```

Returns 8 axis values (0.000–1.000 each):
```json
{
  "vector": {
    "emotional_intensity": 0.750,
    "philosophical_depth": 0.900,
    "physical_presence": 0.200,
    "plot_momentum": 0.400,
    "tension": 0.850,
    "mystery": 0.300,
    "intimacy": 0.600,
    "resolution_tendency": 0.150
  }
}
```

**Find resonance between elements:**
```http
POST /api/v1/narrativelab/resonance
Authorization: Bearer cc_live_...

{ "elementIds": ["uuid1", "uuid2", "uuid3"] }
```
Returns pairs with similarity, conflict scores, and complement analysis.

**What to do with the scores:**
- Character pairs with conflict score > 0.6 → scenes that need confrontation
- Ideas with similarity > 0.8 → consider merging (may be the same theme twice)
- Elements with low `plot_momentum` → need to act, not just exist
- High `philosophical_depth` + low `physical_presence` → ground the abstraction in a physical scene

---

## AI Features

```
POST /api/v1/chat               — Cloud Companion AI chat (builds clouds conversationally, streaming SSE)
POST /api/v1/suggest            — get AI suggestions for any cloud item
POST /api/v1/cloud-items/generate-tags   — AI-generate tags for an item
```

These require a Google AI (Gemini) key configured in user settings (returns `402` if missing).

**Suggest endpoint — full request body:**
```http
POST /api/v1/suggest
Authorization: Bearer cc_live_...

{
  "nodeType": "character",
  "nodeTitle": "Daniel Varga",
  "nodeContent": "A former concert pianist who...",
  "connections": ["The Tuning Room", "Perfection vs. Presence"],
  "proxies": ["stateIn: Confident, bordering on arrogant"],
  "aiNode": {
    "model": "gemini-2.0-flash",
    "apiKey": "<your_gemini_key>",
    "temperature": 0.5
  }
}
```
Returns: `{ "suggestions": ["suggestion 1", "suggestion 2", ...] }`

**Supported models in `aiNode`:**
- `gemini-*` — Google Gemini (default, recommended)
- `claude-*` — Anthropic Claude
- `gpt-*` — OpenAI GPT

**Chat endpoint — streaming SSE:**
```http
POST /api/v1/chat
Authorization: Bearer cc_live_...

{
  "messages": [
    { "role": "user", "content": "A noir story about a piano tuner in 1940s Shanghai" }
  ]
}
```
Returns a Server-Sent Events stream. Chat does not maintain server-side sessions — send full message history with each request.

---

## Publishing

```
POST /api/v1/publish            — publish a draft to ContextTube
GET  /api/v1/publish            — list published pieces
```

**Publish a draft:**
```http
POST /api/v1/publish
Authorization: Bearer cc_live_...

{
  "draftId": "draft_uuid",
  "title": "My Story World",
  "description": "A noir detective story set in 1940s Shanghai",
  "type": "cloud"
}
```
Returns: `{ "success": true, "published": { "id", "slug", "url" } }`

---

## Export to Runway

Converts a saved graph draft into a Runway Scene Manifest with AI-generated motion prompts.

```
POST /api/v1/export/runway      — generate manifest
GET  /api/v1/export/runway/download?draftId={uuid}   — download manifest
```

```http
POST /api/v1/export/runway
Authorization: Bearer cc_live_...

{ "draftId": "draft_xyz" }
```

Returns a scene-by-scene manifest formatted for video production pipelines.

---

## Machine-Readable Specs

All three are public — no auth required. Readable by AI agents directly.

```
GET /api/v1/ping                     — health check
GET /api/v1/docs/api                 — this document (markdown)
GET /api/v1/docs/visual-structure    — Visual Editor node/edge spec (JSON)
GET /api/v1/docs/node-types          — all node types and handle rules (JSON)
```

---

## Autonomous Agent Workflows

### Build a complete story world from scratch
```
1. POST /api/v1/projects { "title": "..." }
2. POST /api/v1/chat with your premise (send full message history each turn)
3. Parse streamed response for cloud item suggestions
4. POST /api/v1/cloud-items/batch to save items (repeat for 5–10 turns)
5. Fill gaps with POST /api/v1/cloud-items (with rich metadata)
6. POST /api/v1/graph-build { "project_id": "..." }
7. POST /api/v1/drafts to save the graph
8. POST /api/v1/publish (optional)
```

### Extract and enhance an existing manuscript
```
1. POST /api/v1/projects { "title": "..." }
2. POST /api/v1/import with file + project_id + temperature 0.5
3. Review returned items — note any in "invalid" array
4. Add missing elements via POST /api/v1/cloud-items (add metadata fields)
5. POST /api/v1/graph-build { "project_id": "..." }
6. Review stateIn/stateOut chains — add transformations where needed
   POST /api/v1/cloud-items/{id}/transformations
7. POST /api/v1/drafts to save
```

### Enhance with narrative analysis
```
1. After populating clouds, vectorize key elements:
   POST /api/v1/narrativelab/vectorize for each character and idea
2. POST /api/v1/narrativelab/resonance with element IDs
3. Identify patterns → refine items → rebuild graph
4. POST /api/v1/graph-build again
5. POST /api/v1/cloud-items/{id}/final-state { "mode": "generate" } for key characters
```

### Co-author with a human partner
```
1. Human creates project and shares API key (cc_live_...)
2. GET /api/v1/cloud-items?project_id={id} to read existing items per type
3. Use POST /api/v1/suggest to generate suggestions rather than direct edits
4. Create new items only in layers the human hasn't populated
5. After changes: POST /api/v1/graph-build → POST /api/v1/drafts
```

---

*Context Cloud — contextcloud.studio*
*Platform for structured creative production.*
