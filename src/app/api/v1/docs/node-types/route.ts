import { NextResponse } from 'next/server';

// GET /api/v1/docs/node-types
// Returns all visual editor node types, their handles, and connection rules as JSON.
// Public endpoint — no auth required. Designed for AI agents to understand the graph schema.
export async function GET() {
  const schema = {
    description: 'Context Cloud Visual Editor — Node Types and Connection Rules',
    docs: 'https://contextcloud.studio/docs',
    spec: 'https://contextcloud.studio/api/v1/docs/visual-structure',

    nodeTypes: [
      {
        type: 'scene',
        cloudType: 'scenes',
        label: 'Scene',
        role: 'The structural spine. Represents a stage location + story moment. Scenes connect to each other in narrative sequence.',
        handles: {
          targets: [
            { id: 'prev_scene', side: 'left', connects: 'Previous scene in sequence' },
            { id: 'characters', side: 'left', connects: 'Character state nodes' },
            { id: 'plot', side: 'left', connects: 'Theme or idea nodes' },
            { id: 'references', side: 'left', connects: 'Reference nodes' },
            { id: 'world', side: 'left', connects: 'World rule nodes' },
          ],
          sources: [
            { id: 'output', side: 'right', connects: 'Next scene\'s prev_scene' },
          ],
        },
        sequencing: 'scene.output → next_scene.prev_scene',
      },
      {
        type: 'character',
        cloudType: 'characters',
        label: 'Character',
        role: 'Full character record. Core contradiction, wound, voice, limits. Never connects directly to a scene — always routes through proxy → state.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Default target' }],
          sources: [{ id: null, side: 'right', connects: 'Default source (to proxy)' }],
        },
      },
      {
        type: 'charactersProxy',
        cloudType: null,
        label: 'Character Proxy',
        role: 'Lightweight stand-in for a character in a specific scene. Create one per character per scene — never reuse across scenes. Connects character → proxy → state → scene.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Character node' }],
          sources: [{ id: null, side: 'right', connects: 'State node' }],
        },
      },
      {
        type: 'state',
        cloudType: null,
        label: 'State',
        role: 'Captures who a character is in this specific scene. Content: one sentence — what they are feeling, wanting, or doing right now. Bridges proxy to scene.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Character proxy' }],
          sources: [{ id: null, side: 'right', connects: 'Scene (characters inlet)' }],
        },
        connectsToScene: 'characters',
      },
      {
        type: 'world',
        cloudType: 'world',
        label: 'World',
        role: 'A rule, system, or fact governing reality in this story. Connect only to scenes where this rule is active or relevant.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Default target' }],
          sources: [{ id: null, side: 'right', connects: 'Default source' }],
        },
        connectsToScene: 'world',
      },
      {
        type: 'theme',
        cloudType: 'ideas',
        label: 'Theme / Idea',
        role: 'A philosophical force or thematic tension. Every theme should contain an internal contradiction.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Default target' }],
          sources: [{ id: null, side: 'right', connects: 'Default source' }],
        },
        connectsToScene: 'plot',
      },
      {
        type: 'bookReference',
        cloudType: 'references',
        label: 'Book Reference',
        role: 'A book influencing the project. Record the specific technique being borrowed, not just the title.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Default target' }],
          sources: [{ id: null, side: 'right', connects: 'Default source' }],
        },
        connectsToScene: 'references',
      },
      {
        type: 'filmReference',
        cloudType: 'references',
        label: 'Film Reference',
        role: 'A film influencing the project.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Default target' }],
          sources: [{ id: null, side: 'right', connects: 'Default source' }],
        },
        connectsToScene: 'references',
      },
      {
        type: 'musicReference',
        cloudType: 'references',
        label: 'Music Reference',
        role: 'Music influencing the emotional texture of the project.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Default target' }],
          sources: [{ id: null, side: 'right', connects: 'Default source' }],
        },
        connectsToScene: 'references',
      },
      {
        type: 'artReference',
        cloudType: 'references',
        label: 'Art Reference',
        role: 'Visual art influencing the project.',
        handles: {
          targets: [{ id: null, side: 'left', connects: 'Default target' }],
          sources: [{ id: null, side: 'right', connects: 'Default source' }],
        },
        connectsToScene: 'references',
      },
    ],

    connectionPatterns: {
      characterInScene: {
        description: 'The required pattern for placing a character in a scene.',
        steps: [
          'character node → (default source) → charactersProxy (default target)',
          'charactersProxy (default source) → state (default target)',
          'state (default source) → scene (targetHandle: "characters")',
        ],
        rule: 'Create one new proxy and one new state per character per scene. Never reuse across scenes.',
      },
      sceneSequence: {
        description: 'Chaining scenes in narrative order.',
        pattern: 'scene1 (sourceHandle: "output") → scene2 (targetHandle: "prev_scene")',
      },
      worldToScene: {
        pattern: 'world (default source) → scene (targetHandle: "world")',
        rule: 'Connect only world rules that are active in this scene.',
      },
      ideaToScene: {
        pattern: 'theme (default source) → scene (targetHandle: "plot")',
      },
      referenceToScene: {
        pattern: 'bookReference/filmReference/etc (default source) → scene (targetHandle: "references")',
        rule: 'Connect only references directly relevant to this scene\'s tone or technique.',
      },
    },

    cloudTypeMapping: {
      characters: 'character',
      scenes: 'scene',
      world: 'world',
      ideas: 'theme',
      references: 'bookReference (default) or filmReference/musicReference/artReference based on metadata.refType',
      arc: 'SCAFFOLD — do not place arc items as content nodes in the graph',
    },

    layoutGuidelines: {
      scenes: 'x: 0, 700, 1400, 2100 ... (700px apart) | y: 0',
      characterProxiesAndStates: 'above their scene | y: -180 to -350',
      worldAndReferences: 'below their scene | y: 200 to 350',
      characterMasterNodes: 'far left column | x: -500',
    },
  };

  return NextResponse.json(schema, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
