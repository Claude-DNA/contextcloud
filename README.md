# ContextCloud Studio

The authoring/creation platform for [ContextTube](https://contextube.ai). Build structured context clouds and flows here, then publish them to ContextTube.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4**
- **NextAuth v5** (beta) — cross-domain SSO with ContextTube
- **PostgreSQL** (raw SQL via `pg`) — shared database with ContextTube
- **@xyflow/react** — visual node canvas editor

## Setup

1. Clone and install:

```bash
git clone <repo>
cd contextcloud
npm install
```

2. Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

**Critical:** Use the same `NEXTAUTH_SECRET` and `DATABASE_URL` as ContextTube for cross-domain SSO.

3. Run migrations (creates `cloud_drafts` table):

```bash
curl -X POST http://localhost:3000/api/v1/migrate
```

4. Start development:

```bash
npm run dev
```

## Architecture

### Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — list clouds/flows, quick actions |
| `/workspace/traditional` | Form-based editor for clouds and flows |
| `/workspace/visual` | Node canvas editor (n8n-style) |
| `/drafts` | All draft items |
| `/published` | All published items |
| `/auth/signin` | Sign in (Google, Apple, email) |
| `/auth/signup` | Register with email |

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/drafts` | List user's drafts |
| POST | `/api/v1/drafts` | Create new draft |
| PUT | `/api/v1/drafts` | Update existing draft |
| DELETE | `/api/v1/drafts` | Delete a draft |
| GET | `/api/v1/drafts/[id]` | Get single draft |
| POST | `/api/v1/publish` | Publish to ContextTube |
| POST | `/api/v1/migrate` | Run DB migrations |

### Cross-Domain Auth

ContextCloud shares the same Postgres database and `NEXTAUTH_SECRET` as ContextTube. Users logged in to contextube.ai are automatically authenticated on contextcloud.studio because both apps produce identical JWTs.

### Visual Editor

The visual workspace uses `@xyflow/react` with five custom node types:

- **CloudNode** — the main context cloud
- **LayerNode** — a context layer (core/context/cultural/reference/bridge)
- **FlowNode** — a shareable context flow
- **ReferenceNode** — a source/reference
- **ConnectionNode** — relationship between nodes

Canvas state is saved as JSON in the `cloud_drafts.canvas_json` column.

### Publish Flow

1. User creates content in either workspace
2. Clicks "Publish to ContextTube"
3. App POSTs to `contextube.ai/api/v1/publish`
4. Updates local draft status to `published`
5. Shows success with link to ContextTube

## Deploy

Deploy to Vercel:

```bash
vercel
```

Set environment variables in Vercel dashboard to match `.env.example`.

## License

Private — ContextTube / ContextCloud
