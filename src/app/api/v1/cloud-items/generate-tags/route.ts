import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';

const TAG_INSTRUCTIONS: Record<string, string> = {
  characters: `Generate tags that capture this character's psychology, role, and dramatic function.
Focus on: emotional state, core contradiction, narrative role, relationship dynamic, arc direction.
Good examples: "guilt-driven", "wants-connection", "self-deceiving", "protector-turned-threat", "arc-complete"
Bad examples: "character", "person", "important"`,

  references: `Generate tags that capture what this reference contributes — technique, tone, or structural element.
Focus on: the specific quality borrowed, the medium type, the emotional register, the narrative function.
Good examples: "slow-burn", "non-linear", "unreliable-narrator", "visual-metaphor", "tonal-contrast"
Bad examples: "reference", "book", "movie", "good"`,

  scenes: `Generate tags that capture this location's atmosphere and dramatic function.
Focus on: sensory qualities, emotional register, narrative role, physical characteristics.
Good examples: "claustrophobic", "false-safety", "turning-point", "cold-light", "inhabited-by-loss"
Bad examples: "place", "location", "scene", "setting"`,

  world: `Generate tags that capture this world element's function and tension.
Focus on: the rule type, what it enables vs. forbids, the social or physical impact, the dramatic consequence.
Good examples: "irreversible", "creates-inequality", "belief-vs-reality", "load-bearing", "hidden-cost"
Bad examples: "world", "rule", "system", "fact"`,

  ideas: `Generate tags that capture this theme's tension and dramatic function.
Focus on: the core contradiction, which characters embody it, how it manifests in action, its opposite.
Good examples: "freedom-vs-safety", "love-as-burden", "self-deception", "costs-the-protagonist", "unresolved"
Bad examples: "theme", "idea", "important", "philosophical"`,

  arc: `Generate tags that capture this story beat's structural role and emotional impact.
Focus on: what changes irreversibly, which character is transformed, the narrative phase, emotional register.
Good examples: "no-return", "act-2-opener", "character-reveals", "costs-relationship", "plants-act-3"
Bad examples: "plot", "story", "beat", "chapter"`,
};

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const apiKey = await getGeminiKey(userId);
  if (!apiKey) return noKeyResponse();

  const { cloudType, title, content } = await req.json();
  const typeKey = (cloudType || '').toLowerCase();
  const typeInstructions = TAG_INSTRUCTIONS[typeKey] || `Generate tags that capture the most important qualities of this creative element.
Focus on: specific attributes, dramatic function, emotional register, narrative role.
Tags must be specific enough that someone could use them to filter and find this exact element.`;

  const prompt = `You are helping tag a creative element in a production bible (Context Cloud) for a story project.

ELEMENT TYPE: ${cloudType}
TITLE: "${title}"
${content ? `DESCRIPTION: "${content}"` : ''}

${typeInstructions}

Generate 4–7 short, specific tags. Rules:
- Single words or short phrases (2–3 words max)
- Specific to THIS element — not generic category labels
- Prefer surprising specificity over obvious labels
- Lowercase only

Return ONLY a JSON array of lowercase strings. Example: ["guilt-driven", "arc-complete", "protector-role"]`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 256 },
        }),
      }
    );

    if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const tags: string[] = JSON.parse(cleaned);
    return NextResponse.json({ tags: Array.isArray(tags) ? tags : [] });
  } catch (err) {
    return NextResponse.json({ error: `Tag generation failed: ${err}` }, { status: 500 });
  }
}
