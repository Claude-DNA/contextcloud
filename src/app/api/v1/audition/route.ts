import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { generate } from '@/lib/ai';
import { getAiConfig, noKeyResponse, aiErrorResponse } from '@/lib/ai-key';
import { ATOMIC_STATE_MAP, formatFormula } from '@/lib/state-formula';
import { AUDITION_SYSTEM, MAX_CAST, auditionPrompt, blendCast, type Adjustment, type AuditionInput, type CastMember, type Turn } from '@/lib/audition';

export const maxDuration = 120;

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase()).filter((x) => ATOMIC_STATE_MAP[x]).slice(0, 4) : []);

/**
 * POST /api/v1/audition
 * { name?, who?, scene, context?, cast: [{ state: <an entry of the state library>, weight: 1-100 }] (1 to 3),
 *   adjustments?: [{ state: <vocabulary id>, amount: -100..100 }], shows?: <vocabulary id> | "none" | "auto",
 *   intensity?: 1 | 2 | 3, turns?: [{ role: "character" | "scene" | "direction", text }] }
 * The AI plays the writer's character in the blended state. → { take, formula, formula_text, strengths }
 * With no turns it opens the scene. After a "scene" turn it answers it; after a "direction" it replays
 * its last take as directed; after a "character" turn it gives another take of the same moment.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  await isDbAvailable();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const cast: CastMember[] = (Array.isArray(body.cast) ? body.cast : []).slice(0, MAX_CAST).flatMap((m) => {
    const s = (m as { state?: Record<string, unknown> })?.state;
    const base = ids(s?.base);
    if (!s || !base.length) return [];
    const weight = Math.min(100, Math.max(0, Number((m as { weight?: unknown }).weight) || 0));
    const modifier = typeof s.modifier === 'string' && ATOMIC_STATE_MAP[s.modifier] ? s.modifier : undefined;
    return [{
      weight,
      state: {
        id: str(s.id, 120), character: str(s.character, 80), moment: str(s.moment, 160), work: str(s.work, 120),
        situation: str(s.situation, 600), inside: str(s.inside, 700), outside: str(s.outside, 600), formula: str(s.formula, 120),
        base, missing: ids(s.missing).filter((x) => !base.includes(x)).slice(0, 2), ...(modifier ? { modifier } : {}),
        intensity: [1, 2, 3].includes(Number(s.intensity)) ? Number(s.intensity) : 2,
      },
    }];
  });
  const adjustments: Adjustment[] = (Array.isArray(body.adjustments) ? body.adjustments : []).slice(0, 8).flatMap((a) => {
    const state = String((a as { state?: unknown })?.state ?? '').toLowerCase();
    const amount = Math.round(Number((a as { amount?: unknown })?.amount));
    return ATOMIC_STATE_MAP[state] && Number.isFinite(amount) && amount !== 0 ? [{ state, amount: Math.min(100, Math.max(-100, amount)) }] : [];
  });
  const scene = str(body.scene, 2000).trim();
  if (!cast.some((m) => m.weight > 0)) return NextResponse.json({ error: 'Cast at least one state, with a weight above zero.' }, { status: 400 });
  if (scene.length < 10) return NextResponse.json({ error: 'Describe the scene: where the character is, who else is there, and what is happening.' }, { status: 400 });

  const shows = typeof body.shows === 'string' ? body.shows.toLowerCase() : null;
  const intensity = [1, 2, 3].includes(Number(body.intensity)) ? (Number(body.intensity) as 1 | 2 | 3) : null;
  const blend = blendCast(cast, adjustments, shows, intensity);
  if (!blend) return NextResponse.json({ error: 'With these adjustments nothing is left for the character to feel. Turn fewer feelings down.' }, { status: 400 });

  const roles = new Set(['character', 'scene', 'direction']);
  const turns: Turn[] = (Array.isArray(body.turns) ? body.turns : []).slice(-12).flatMap((t) => {
    const role = String((t as { role?: unknown })?.role);
    const text = str((t as { text?: unknown })?.text, 1500).trim();
    return roles.has(role) && text ? [{ role: role as Turn['role'], text }] : [];
  });
  const input: AuditionInput = { name: str(body.name, 80).trim(), who: str(body.who, 600).trim(), cast, adjustments, shows, intensity, scene, context: str(body.context, 3000), turns };

  const ai = await getAiConfig(userId);
  if (!ai) return noKeyResponse();
  try {
    const take = (await generate({ ai, system: AUDITION_SYSTEM, prompt: auditionPrompt(input, blend), temperature: 0.9, maxTokens: 1200 })).trim();
    return NextResponse.json({ take, formula: blend.formula, formula_text: formatFormula(blend.formula), strengths: blend.strengths });
  } catch (e) {
    return aiErrorResponse(e, 'The audition could not be played');
  }
}
