import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';

interface SuggestBody {
  nodeType: string;
  nodeTitle: string;
  nodeContent: string;
  connections: Array<{ type: string; title: string; content: string }>;
  proxies: Array<{ type: string; elements: string[] }>;
  aiNode?: { model: string; apiKey: string; systemPrompt?: string; temperature?: number };
}

const TYPE_INSTRUCTIONS: Record<string, string> = {
  characters: `This is a CHARACTER in a story world. Suggest what is MISSING to make this character feel irreducible — someone who could not be swapped out for a generic version.
Focus on: the contradiction at their core (what they want vs. what they need), the wound that shaped them, how they speak differently from everyone else, what they would never do — and what would make them do it anyway. Be specific to THIS character's details, not generic writing advice.`,

  character: `This is a CHARACTER in a story world. Suggest what is MISSING to make this character feel irreducible — someone who could not be swapped out for a generic version.
Focus on: the contradiction at their core (what they want vs. what they need), the wound that shaped them, how they speak differently from everyone else, what they would never do — and what would make them do it anyway. Be specific to THIS character's details, not generic writing advice.`,

  scenes: `This is a STAGE LOCATION — a place where story happens. Suggest what would make this location feel like it exists independently of the story.
Focus on: what this place DOES to people emotionally and psychologically, what sensory detail is missing (light quality, sound, smell, texture), what has happened here that left a mark, what this location reveals about the world that no other place could. Every suggestion must be specific enough that a stranger could visualize it immediately.`,

  scene: `This is a STAGE LOCATION — a place where story happens. Suggest what would make this location feel like it exists independently of the story.
Focus on: what this place DOES to people emotionally and psychologically, what sensory detail is missing (light quality, sound, smell, texture), what has happened here that left a mark, what this location reveals about the world that no other place could. Every suggestion must be specific enough that a stranger could visualize it immediately.`,

  world: `This is a WORLD ELEMENT — a rule, system, or fact that governs reality in this story. Suggest what is missing to make this element feel load-bearing.
Focus on: the rules that feel inevitable (what is impossible here and why), what people believe vs. what is actually true, the tension this element creates in daily life, what it says about the human (or non-human) condition. A good world element is one the entire story depends on.`,

  references: `This is a REFERENCE — a creative influence (film, book, music, art) that informs the project. Suggest how to use it more precisely.
Focus on: the specific technique or structural element being borrowed (not just the theme), how this reference challenges or complicates the project rather than just confirming it, what the creator should consciously AVOID copying, the single most useful thing to extract that is not yet captured.`,

  bookReference: `This is a BOOK REFERENCE informing the project. Suggest how to use it more precisely.
Focus on: the specific technique or structural element being borrowed, how this reference challenges rather than just confirms the project, what to avoid copying, and the single most useful thing to extract that is not yet in the notes.`,

  musicReference: `This is a MUSIC REFERENCE informing the emotional texture of the project. Suggest how to translate it more precisely into the work.
Focus on: the specific mood, rhythm, or emotional progression this music represents, how to embed that quality in prose or scene structure, what instrument or motif maps to which character or theme.`,

  artReference: `This is an ART REFERENCE informing the visual and atmospheric identity of the project. Suggest how to use it more precisely.
Focus on: the specific lighting, composition, or emotional quality that should carry over, how to translate visual qualities into prose description, what the art reveals about how scenes or characters should be framed.`,

  filmReference: `This is a FILM REFERENCE informing the project. Suggest how to use it more precisely.
Focus on: the specific cinematographic or storytelling technique being borrowed, how this film's approach to character, pacing, or structure applies here, what to consciously avoid reproducing literally.`,

  ideas: `This is a THEME or IDEA — a philosophical or moral force running through the story. Suggest what would sharpen it into a real tension.
Focus on: the internal contradiction inside this theme (what it promises vs. what it costs), how it should manifest in CHARACTER behavior rather than as abstract statement, what the opposite of this idea looks like and where that appears in the story. A theme without an opposing force is decoration, not structure.`,

  theme: `This is a THEME or IDEA — a philosophical or moral force running through the story. Suggest what would sharpen it into a real tension.
Focus on: the internal contradiction inside this theme (what it promises vs. what it costs), how it should manifest in CHARACTER behavior rather than as abstract statement, what the opposite of this idea looks like and where that appears in the story.`,

  arc: `This is a STORY ARC or PLOT BEAT. Suggest what would make this beat feel inevitable in retrospect but surprising on arrival.
Focus on: what decision or revelation makes this beat irreversible, how this beat changes the protagonist's psychology (not just their situation), what question this beat answers and what new question it opens, which earlier elements it pays off and which future elements it plants.`,

  chapterAct: `This is a CHAPTER or ACT — a structural unit of the story. Suggest what would make this unit feel necessary rather than arbitrary.
Focus on: the emotional state the reader enters with vs. exits with, the one irreversible change that happens here, which character relationship shifts and how, what new information the reader gains vs. what they are still denied.`,

  plot: `This is a PLOT POINT — a specific event or development in the narrative. Suggest what would sharpen its impact.
Focus on: the character decision that makes this event meaningful (events without choices are just things that happen), how this plot point forces a character to reveal something they would rather hide, what it costs someone and whether they chose to pay that cost.`,
};

function buildPrompt(body: SuggestBody): string {
  const { nodeType, nodeTitle, nodeContent, connections } = body;

  const typeKey = nodeType.toLowerCase();
  const typeInstructions = TYPE_INSTRUCTIONS[typeKey] || `This is a ${nodeType} element in a story world. Suggest what is missing to make it feel specific and necessary.
Focus on: what makes this element irreplaceable, the internal contradiction or tension inside it, and how it connects to other elements in the story.`;

  const connectionsText = connections?.length
    ? connections.map(c => `- ${c.type}: "${c.title}" — ${c.content}`).join('\n')
    : 'None yet';

  return `You are helping develop a Context Cloud — a structured production bible for a creative project (novel, screenplay, game, or film).

ELEMENT TYPE: ${nodeType}
TITLE: "${nodeTitle}"
CURRENT CONTENT: ${nodeContent || '(not yet written)'}

CONNECTED ELEMENTS:
${connectionsText}

${typeInstructions}

RULES FOR YOUR SUGGESTIONS:
- Every suggestion must be specific to THIS element — reference its actual title and content, not generic advice
- Prefer surprising specificity over generic ideas
- Each suggestion should be something that, if added, would make this element feel more alive and irreducible
- Do NOT suggest things already present in the current content

Return ONLY a JSON array of 3–5 strings. Each string is one concrete suggestion (1–2 sentences max).`;
}

function parseSuggestions(text: string): string[] {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.map(String);
    return [String(parsed)];
  } catch {
    return text.split('\n').filter((l: string) => l.trim().length > 0).slice(0, 5);
  }
}

async function callGemini(prompt: string, apiKey: string, model: string, temperature: number): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API error: ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
}

async function callAnthropic(prompt: string, apiKey: string, model: string, temperature: number, systemPrompt?: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`);
  const data = await res.json();
  return data?.content?.[0]?.text || '[]';
}

async function callOpenAI(prompt: string, apiKey: string, model: string, temperature: number, systemPrompt?: string): Promise<string> {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '[]';
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json() as SuggestBody;
  const prompt = buildPrompt(body);
  const { aiNode } = body;

  try {
    let text: string;

    if (aiNode?.apiKey && aiNode?.model) {
      const temperature = aiNode.temperature ?? 0.8;
      if (aiNode.model.startsWith('claude-')) {
        text = await callAnthropic(prompt, aiNode.apiKey, aiNode.model, temperature, aiNode.systemPrompt);
      } else if (aiNode.model.startsWith('gpt-')) {
        text = await callOpenAI(prompt, aiNode.apiKey, aiNode.model, temperature, aiNode.systemPrompt);
      } else {
        text = await callGemini(prompt, aiNode.apiKey, aiNode.model, temperature);
      }
    } else {
      const apiKey = await getGeminiKey(userId);
      if (!apiKey) return noKeyResponse();
      text = await callGemini(prompt, apiKey, 'gemini-2.0-flash', 0.9);
    }

    const suggestions = parseSuggestions(text);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json({ error: `Failed to get suggestions: ${err}` }, { status: 500 });
  }
}
