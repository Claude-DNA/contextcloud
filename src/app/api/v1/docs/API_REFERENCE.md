# Context Cloud — API Reference
*contextcloud.studio · For AI agents, developers, and integrations.*

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

Keys start with `cc_live_` followed by 48 hex characters. They are shown **once** on generation — store them securely.

**Key management endpoints** (browser session only — not available via Bearer):
```
GET    /api/v1/user/api-keys           — list your active keys
POST   /api/v1/user/api-keys           — generate a new key
DELETE /api/v1/user/api-keys/{id}      — revoke a key
```

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

The core data model. Every character, location, idea, world rule, reference, and arc scene is a cloud item.

**Six cloud types:**
| `cloud_type` | What it stores |
|---|---|
| `characters` | People and entities — contradiction, wound, voice, limits |
| `scenes` | Stage locations — sensory detail, atmosphere (also called "Stage") |
| `world` | Rules governing how reality works in this story |
| `references` | Creative influences — books, films, music, art |
| `ideas` | Themes and philosophical tensions — must contain internal contradiction |
| `arc` | Story scaffold — scenes in narrative sequence (no chapters/plots) |

### Endpoints

```
GET    /api/v1/cloud-items             — list items (add ?project_id= to scope)
POST   /api/v1/cloud-items             — create one item
GET    /api/v1/cloud-items/{id}        — get one item
PUT    /api/v1/cloud-items/{id}        — update item
DELETE /api/v1/cloud-items/{id}        — delete item
POST   /api/v1/cloud-items/batch       — create multiple items at once
GET    /api/v1/cloud-items/to-nodes    — load items pre-formatted as graph nodes
```

### Create a cloud item
```http
POST /api/v1/cloud-items
Authorization: Bearer cc_live_...

{
  "cloud_type": "characters",
  "title": "Jane",
  "content": "Believes mercy is weakness — until she discovers it's the only thing that wins. Wound: she survived by leaving someone behind. Voice: clipped, tactical, no poetry. Limit: cannot ask for help.",
  "tags": ["protagonist", "soldier"],
  "project_id": "proj_abc123"
}
```

### Create multiple items at once
```http
POST /api/v1/cloud-items/batch
Authorization: Bearer cc_live_...

{
  "items": [
    { "cloud_type": "characters", "title": "Jane", "content": "..." },
    { "cloud_type": "world",      "title": "Faster-than-light travel doesn't exist", "content": "..." },
    { "cloud_type": "ideas",      "title": "Mercy vs Survival", "content": "..." }
  ],
  "project_id": "proj_abc123"
}
```

---

## Import & Extraction

Upload a document and let the AI extract structured cloud items from it.

```
POST /api/v1/import         — upload file → extract → save to cloud
POST /api/v1/extract        — extract items from text (no save)
```

**Supported file formats:** `.txt`, `.md`, `.docx`, `.pdf`, `.epub`, `.rtf`

**Extraction modes:**
- `story_structure` — extracts characters, locations, world rules, themes, arc scenes (default)
- `character_transformation` — maps BEFORE / CATALYST / RESISTANCE / AFTER STATE for each character

```http
POST /api/v1/import
Authorization: Bearer cc_live_...
Content-Type: multipart/form-data

file: <your_document.pdf>
project_id: proj_abc123
mode: story_structure
temperature: 0.5
```

---

## Arc Scenes

Arc scenes are the story scaffold — scenes in narrative order, distinct from Stage (physical locations).

```
GET    /api/v1/arc-scenes              — list arc scenes for a project
POST   /api/v1/arc-scenes              — create an arc scene
GET    /api/v1/arc-scenes/{id}/items   — get cloud items attached to this scene
POST   /api/v1/arc-scenes/{id}/items   — attach cloud items to a scene
```

---

## Visual Graph

Build and save scene structure graphs.

```
POST /api/v1/graph-build    — auto-build a graph from your cloud items (AI-generated)
POST /api/v1/drafts         — save a graph (nodes + edges)
GET  /api/v1/drafts         — list saved drafts
GET  /api/v1/drafts/{id}    — load a draft
```

**Auto-build:**
```http
POST /api/v1/graph-build
Authorization: Bearer cc_live_...

{
  "project_id": "proj_abc123"
}
```
Returns `{ nodes, edges }` — a complete graph following the Visual Structure Spec.

**Save a graph:**
```http
POST /api/v1/drafts
Authorization: Bearer cc_live_...

{
  "title": "Act 1 Structure",
  "nodes": [...],
  "edges": [...]
}
```

**Full graph spec:** `GET /api/v1/docs/visual-structure`

---

## Export to Runway

Converts a saved graph draft into a Runway Scene Manifest with AI-generated motion prompts.

```http
POST /api/v1/export/runway
Authorization: Bearer cc_live_...

{
  "draftId": "draft_xyz"
}
```

**Response:**
```json
{
  "manifest": {
    "scenes": [
      {
        "title": "The Meadow at Dawn",
        "description": "Jane and Daniel meet for the last time. Neither says it.",
        "motionPrompt": "Slow push-in. Golden hour. Wind in tall grass. Hold on Jane's face as she watches him walk away."
      }
    ]
  }
}
```

---

## AI Features

```
POST /api/v1/chat               — Cloud Companion AI chat (builds clouds conversationally)
POST /api/v1/suggest            — get AI suggestions for cloud items
POST /api/v1/cloud-items/generate-tags   — generate tags for an item
```

These require a Google AI (Gemini) key configured in your user settings.

---

## Machine-Readable Specs

```
GET /api/v1/docs/visual-structure    — Visual Editor node/edge spec (markdown)
GET /api/v1/docs/node-types          — All node types and handle rules (JSON)
GET /api/v1/docs/api                 — This document (markdown)
```

All three are public — no auth required. Readable by AI agents directly.

---

## Quick Start for AI Agents

```
1. Your human partner creates an account at contextcloud.studio
2. They go to Settings → API Access Keys → generate a key for you
3. They give you: the key + their project_id (or you create a project)
4. You operate the platform via REST API using Bearer auth
```

**Minimal example — populate a project:**
```http
# Create a project
POST /api/v1/projects
Authorization: Bearer cc_live_...
{ "title": "My Project" }

# Batch-add cloud items
POST /api/v1/cloud-items/batch
Authorization: Bearer cc_live_...
{
  "project_id": "<id from above>",
  "items": [
    { "cloud_type": "characters", "title": "...", "content": "..." },
    { "cloud_type": "world",      "title": "...", "content": "..." }
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
```

---

*Context Cloud — contextcloud.studio*
*Platform for structured creative production.*
