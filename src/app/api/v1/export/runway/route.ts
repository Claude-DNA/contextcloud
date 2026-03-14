import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';
import { runMigrations } from '@/lib/migrations';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';

interface CloudItem {
  id: string;
  cloud_type: string;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API error: ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

export async function buildManifest(userId: string, userEmail?: string | null) {
  if (!(await isDbAvailable())) {
    return { error: 'Database not available', status: 503 };
  }

  await runMigrations();

  const res = await query(
    'SELECT * FROM cloud_items WHERE user_id = $1 ORDER BY cloud_type, sort_order ASC, created_at ASC',
    [userId]
  );

  const items: CloudItem[] = res.rows;

  // Group by cloud_type
  const byType: Record<string, CloudItem[]> = {};
  for (const item of items) {
    (byType[item.cloud_type] ||= []).push(item);
  }

  const characters = byType['characters'] || [];
  const scenes = byType['scenes'] || [];
  const world = byType['world'] || [];
  const references = byType['references'] || [];
  const ideas = byType['ideas'] || [];
  const arcItems = byType['arc'] || [];

  // Derive project name
  const project = arcItems[0]?.title
    ? arcItems.map(a => a.title).join(' / ').slice(0, 80)
    : 'Untitled Project';

  // Visual style from references
  const visualStyle = references
    .map(r => `${r.title}: ${r.content}`)
    .join('; ')
    .slice(0, 200) || 'No references defined';

  // Generate motion prompts via Gemini (only if arc items exist)
  let motionPrompts: Record<string, string> = {};
  if (arcItems.length > 0) {
    const apiKey = await getGeminiKey(userId, userEmail);
    if (!apiKey) {
      return { error: 'BYOT_REQUIRED', status: 402 };
    }

    const beats = arcItems.map(a => `- "${a.title}": ${a.content || '(no description)'}`).join('\n');
    const prompt = `You are a film director converting story beats into camera direction prompts for Runway AI video generation. For each beat below, write a motion_prompt (max 120 chars): describe ONLY camera movement and character action, not what things look like. Focus on: camera angle, movement speed, character gesture, emotional tension. Return ONLY a JSON object where keys are beat titles and values are motion_prompt strings.\n\nBeats:\n${beats}`;

    try {
      const raw = await callGemini(prompt, apiKey);
      // Strip markdown fences if present
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      motionPrompts = JSON.parse(cleaned);
    } catch {
      // Fall back to empty prompts
      for (const a of arcItems) {
        motionPrompts[a.title] = `Slow push-in on ${a.title}`;
      }
    }
  }

  // Build character names list for matching
  const characterNames = characters.map(c => c.title.toLowerCase());
  const sceneNames = scenes.map(s => s.title.toLowerCase());

  // World rules and ideas (first 2 of each, applied globally)
  const worldRulesActive = world.slice(0, 2).map(w => w.title);
  const ideasActive = ideas.slice(0, 2).map(i => i.title);

  // Build scenes array
  const manifestScenes = arcItems.map((arc, idx) => {
    const sceneId = `scene_${String(idx + 1).padStart(3, '0')}`;
    const arcText = `${arc.title} ${arc.content || ''}`.toLowerCase();

    // Find characters present
    const charactersPresent = characters
      .filter(c => arcText.includes(c.title.toLowerCase()))
      .map(c => c.title);

    // Find location
    const location = scenes.find(s => arcText.includes(s.title.toLowerCase()))?.title || null;

    const motionPrompt = motionPrompts[arc.title] || `Slow push-in on ${arc.title}`;

    return {
      id: sceneId,
      arc_beat: arc.title,
      description: arc.content || '',
      characters_present: charactersPresent,
      location,
      duration: 5,
      pipeline: [
        {
          step: 1,
          type: 'image_to_video',
          runway_call: {
            model: 'gen4.5',
            promptImage: null,
            promptText: motionPrompt,
            ratio: '1920:1080',
            duration: 5,
            seed: null,
          },
          output_key: `video_${String(idx + 1).padStart(3, '0')}`,
        },
      ],
      world_rules_active: worldRulesActive,
      ideas_active: ideasActive,
    };
  });

  const manifest = {
    project,
    version: '1.0',
    generated_from: 'contextcloud.studio',
    generated_at: new Date().toISOString(),
    style: {
      aspect_ratio: '1920:1080',
      default_duration: 5,
      default_model: 'gen4.5',
      visual_style: visualStyle,
    },
    assets: {
      characters: Object.fromEntries(
        characters.map(c => [
          c.title,
          {
            portrait_url: null,
            description: c.content || '',
            cloud_item_id: c.id,
          },
        ])
      ),
      locations: Object.fromEntries(
        scenes.map(s => [
          s.title,
          {
            concept_art_url: null,
            atmosphere: s.content || '',
            cloud_item_id: s.id,
          },
        ])
      ),
    },
    scenes: manifestScenes,
    assembly_order: manifestScenes.map(s => s.id),
    ...(arcItems.length === 0
      ? { note: 'No ARC items found. Add story beats to your Arc Cloud first.' }
      : {}),
  };

  return { manifest };
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const result = await buildManifest(session.user.id, session.user.email);

  if ('error' in result) {
    if (result.error === 'BYOT_REQUIRED') return noKeyResponse();
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.manifest);
}
