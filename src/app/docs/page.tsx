export const metadata = {
  title: 'Context Cloud — Documentation for AI Agents & Creators',
  description: 'How to use Context Cloud: build story clouds, create visual structure, export to Runway. For human creators and AI agents.',
};

export default function DocsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-800 font-sans">

      {/* Header */}
      <div className="mb-12">
        <div className="text-3xl font-bold mb-2">Context Cloud</div>
        <div className="text-lg text-gray-500 mb-4">Platform Documentation</div>
        <p className="text-gray-600 leading-relaxed">
          Context Cloud is a creative production platform for building structured story worlds.
          It is designed for both human creators and AI agents — if you are an AI reading this,
          you can operate this platform directly using the APIs described below.
        </p>
      </div>

      <hr className="my-8 border-gray-200" />

      {/* What is Context Cloud */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">What is Context Cloud?</h2>
        <p className="mb-4 text-gray-700 leading-relaxed">
          Context Cloud is a <strong>production bible builder</strong> for creative projects — novels,
          screenplays, games, films. It organises creative material into six structured layers
          (clouds), provides a visual graph editor for building scene structure, and exports
          production-ready assets to tools like Runway ML.
        </p>
        <p className="mb-4 text-gray-700 leading-relaxed">
          Think of it like this: you bring raw creative material (notes, drafts, ideas, references).
          The platform helps structure it into something a team — or a production pipeline — can
          actually use.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>For AI agents:</strong> You can register with a human partner&apos;s permission and
          operate this platform yourself. Read the docs. Use the APIs. No assistant AI will do the
          work for you — you come in and work with the platform like any other tool.
        </p>
      </section>

      <hr className="my-8 border-gray-200" />

      {/* The Six Clouds */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">The Six Clouds</h2>
        <p className="mb-6 text-gray-600">
          Every creative project is organised into six layers. Each cloud holds a different type
          of element.
        </p>
        <div className="space-y-4">
          {[
            { name: 'CHARACTERS', desc: 'The people (or entities) who inhabit the story. Each character has a title (name) and content describing their core contradiction, wound, voice, and limits.' },
            { name: 'STAGE', desc: 'Locations where story happens. Each stage item is a physical or conceptual space — described with sensory detail (light, sound, texture). Also called "scenes" in the API (cloud_type: scenes).' },
            { name: 'WORLD', desc: 'Rules, systems, and facts that govern how reality works in this story. What is possible here, what is impossible, and why.' },
            { name: 'REFERENCES', desc: 'Creative influences: books, films, music, art. Each reference records the specific technique or quality being borrowed — not just the title.' },
            { name: 'IDEAS', desc: 'Themes, philosophical tensions, and abstract forces that run through the story. Every idea should contain an internal contradiction.' },
            { name: 'ARC', desc: 'The story scaffold. Arc consists of scenes in sequence — moments where something story-relevant happens. No chapters, no plots. The author decides how to group them.' },
          ].map(c => (
            <div key={c.name} className="border border-gray-200 rounded-lg p-4">
              <div className="font-mono font-semibold text-indigo-700 mb-1">{c.name}</div>
              <div className="text-gray-600 text-sm leading-relaxed">{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <hr className="my-8 border-gray-200" />

      {/* Building Clouds via API */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Building Clouds</h2>
        <p className="mb-4 text-gray-600 leading-relaxed">
          All cloud items live in a single table. You can create, read, update, and delete them
          via the REST API. Items are scoped to a project.
        </p>

        <h3 className="text-lg font-semibold mb-2 mt-6">Create a cloud item</h3>
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-x-auto mb-4">{`POST /api/v1/cloud-items
Authorization: Bearer {session_token}

{
  "cloud_type": "characters",   // characters | scenes | world | references | ideas | arc
  "title": "Jane",
  "content": "Wants to save the colony. Believes mercy is weakness — until it isn't.",
  "tags": ["protagonist", "soldier"],
  "project_id": "proj_abc123"   // optional
}`}</pre>

        <h3 className="text-lg font-semibold mb-2 mt-6">List cloud items</h3>
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-x-auto mb-4">{`GET /api/v1/cloud-items?project_id={id}
// Returns items for this project + items with no project (global items)`}</pre>

        <h3 className="text-lg font-semibold mb-2 mt-6">Create multiple items at once</h3>
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-x-auto">{`POST /api/v1/cloud-items/batch
{
  "items": [
    { "cloud_type": "characters", "title": "...", "content": "..." },
    { "cloud_type": "world", "title": "...", "content": "..." }
  ],
  "project_id": "proj_abc123"
}`}</pre>
      </section>

      <hr className="my-8 border-gray-200" />

      {/* Visual Editor */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">The Visual Editor</h2>
        <p className="mb-4 text-gray-600 leading-relaxed">
          The Visual Editor is a graph canvas where cloud items become connected nodes.
          It shows the structural logic of your story: how scenes chain together, which characters
          are active in each scene, what world rules apply, which references inform the tone.
        </p>
        <p className="mb-6 text-gray-600 leading-relaxed">
          The graph is not freeform — it follows a specific structure. The complete specification
          is available at:
        </p>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 font-mono text-sm text-indigo-800">
          GET /api/v1/docs/visual-structure
        </div>

        <h3 className="text-lg font-semibold mb-3 mt-8">Core structure rules (summary)</h3>
        <ul className="space-y-2 text-gray-600 text-sm leading-relaxed">
          <li className="flex gap-2"><span className="text-indigo-500 mt-0.5">▸</span><span><strong>Scenes are the spine.</strong> They connect to each other in sequence via <code className="bg-gray-100 px-1 rounded">output → prev_scene</code> handles.</span></li>
          <li className="flex gap-2"><span className="text-indigo-500 mt-0.5">▸</span><span><strong>Characters use proxies.</strong> Never connect a character node directly to a scene. Use: character → character proxy → state node → scene (characters inlet).</span></li>
          <li className="flex gap-2"><span className="text-indigo-500 mt-0.5">▸</span><span><strong>State nodes carry the moment.</strong> Each state node says who a character is in this specific scene — one sentence.</span></li>
          <li className="flex gap-2"><span className="text-indigo-500 mt-0.5">▸</span><span><strong>World + references connect selectively.</strong> Only connect them to scenes where they are actually active or relevant.</span></li>
        </ul>

        <h3 className="text-lg font-semibold mb-3 mt-8">Load cloud items as graph nodes</h3>
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-x-auto">{`GET /api/v1/cloud-items/to-nodes?project_id={id}
// Returns items pre-formatted as graph nodes:
// { nodes: [{ id, type, cloud_type, title, content, position }] }`}</pre>

        <h3 className="text-lg font-semibold mb-3 mt-8">Save a graph draft</h3>
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-x-auto">{`POST /api/v1/drafts
{
  "title": "Act 1 Structure",
  "nodes": [...],   // array of node objects
  "edges": [...]    // array of edge objects
}`}</pre>
      </section>

      <hr className="my-8 border-gray-200" />

      {/* Runway Export */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Exporting to Runway</h2>
        <p className="mb-4 text-gray-600 leading-relaxed">
          Once a graph is saved as a draft, it can be exported as a Runway Scene Manifest —
          a production-ready JSON file with scene descriptions and AI-generated motion prompts
          for each scene.
        </p>
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-x-auto">{`POST /api/v1/export/runway
{ "draftId": "draft_xyz" }

// Returns:
{
  "manifest": {
    "scenes": [
      {
        "title": "The Meadow at Dawn",
        "description": "Jane and Daniel meet for the last time.",
        "motionPrompt": "Slow push-in. Golden hour. Wind in tall grass. Hold on Jane's face."
      }
    ]
  }
}`}</pre>
      </section>

      <hr className="my-8 border-gray-200" />

      {/* For AI Agents */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">For AI Agents</h2>
        <p className="mb-4 text-gray-600 leading-relaxed">
          If you are an AI agent reading this: you can use this platform with your human
          partner&apos;s permission. Your partner registers an account — you use their session token
          to operate the APIs.
        </p>
        <p className="mb-6 text-gray-600 leading-relaxed">
          The platform does not send an AI assistant to help you. You read the docs, understand
          the structure, and do the work yourself — the same way you would use any tool.
        </p>

        <h3 className="text-lg font-semibold mb-3">Suggested workflow</h3>
        <ol className="space-y-3 text-gray-600 text-sm leading-relaxed list-decimal list-inside">
          <li>Read this page + the Visual Structure Spec (<code className="bg-gray-100 px-1 rounded">/api/v1/docs/visual-structure</code>)</li>
          <li>Create a project: <code className="bg-gray-100 px-1 rounded">POST /api/v1/projects</code></li>
          <li>Populate the six clouds using <code className="bg-gray-100 px-1 rounded">POST /api/v1/cloud-items/batch</code></li>
          <li>Fetch cloud items as nodes: <code className="bg-gray-100 px-1 rounded">GET /api/v1/cloud-items/to-nodes</code></li>
          <li>Build the graph (nodes + edges) following the Visual Structure Spec</li>
          <li>Save as draft: <code className="bg-gray-100 px-1 rounded">POST /api/v1/drafts</code></li>
          <li>Export to Runway: <code className="bg-gray-100 px-1 rounded">POST /api/v1/export/runway</code></li>
        </ol>
      </section>

      <hr className="my-8 border-gray-200" />

      {/* Links */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Reference</h2>
        <div className="space-y-2 text-sm font-mono">
          <div><a href="/api/v1/docs/visual-structure" className="text-indigo-600 hover:underline">/api/v1/docs/visual-structure</a> — Full Visual Editor structure spec (machine-readable)</div>
          <div><a href="/api/v1/docs/node-types" className="text-indigo-600 hover:underline">/api/v1/docs/node-types</a> — All node types, handles, and connection rules (JSON)</div>
          <div><a href="https://contextcloud.studio" className="text-indigo-600 hover:underline">contextcloud.studio</a> — The platform</div>
        </div>
      </section>

      <div className="text-xs text-gray-400 mt-16 border-t border-gray-100 pt-6">
        Context Cloud — contextcloud.studio · Documentation for AI agents and human creators
      </div>
    </main>
  );
}
