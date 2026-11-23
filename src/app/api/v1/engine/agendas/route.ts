import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { aiErrorResponse, getAiConfig, noKeyResponse } from '@/lib/ai-key';
import { generateJson } from '@/lib/ai';
import { loadItem, loadProjectItems } from '@/lib/engine/server';
import { AGENDA_SCHEMA, AGENDA_SYSTEM } from '@/lib/engine/prompts';
import { readEffect, readInstance } from '@/lib/engine';

export const maxDuration = 90;

/** POST { character_id }: proposes declared and real agendas from the character's drives. Not saved. */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const ai = await getAiConfig(userId);
  if (!ai) return noKeyResponse();

  const { character_id } = (await req.json().catch(() => ({}))) as { character_id?: string };
  const item = character_id ? await loadItem(userId, character_id) : null;
  if (!item || item.cloud_type !== 'characters') return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  const items = await loadProjectItems(userId, item.project_id);
  const chars = items.filter((i) => i.cloud_type === 'characters');
  const scenes = items.filter((i) => i.cloud_type === 'arc');
  const known = new Set(chars.map((c) => c.id));
  const inst = readInstance((item.metadata as Record<string, unknown> | null)?.engine, item.title);
  const id = inst.identity;

  const prompt = `CHARACTER id:"${item.id}" ${item.title}
${(item.content ?? '').slice(0, 1500)}
Core drives: ${id.drives.map((d) => `${d.drive} ${d.weight}`).join(', ') || '(not set: infer from the description)'}
Fears: ${id.fears.map((f) => f.fear).join(', ') || '-'}; values: ${id.values.join(', ') || '-'}
Old wounds: ${id.history.map((h) => `${h.wound} (${h.feeling}${h.targetRole ? `, role: ${h.targetRole}` : ''})`).join('; ') || '-'}

THE OTHER CHARACTERS
${chars.filter((c) => c.id !== item.id).map((c) => `- id:"${c.id}" ${c.title}: ${(c.content ?? '').slice(0, 240)}`).join('\n') || '(none)'}

THE STORY, scene by scene
${scenes.slice(0, 40).map((s, i) => `${i + 1}. ${s.title}: ${(s.content ?? '').replace(/\s+/g, ' ').slice(0, 200)}`).join('\n') || '(no scenes yet)'}

Propose the declared agenda and one to three real agendas of ${item.title} in this story, each with "effect" as a list of { target, value } (include "${item.id}" for what they gain themselves). Then the roles.`;

  try {
    const raw = await generateJson<{ declared?: { label?: string; effect?: unknown }; real?: { label?: string; effect?: unknown; weight?: number }[]; roles?: { role?: string; character?: string }[]; reasoning?: string }>({
      ai, system: AGENDA_SYSTEM, prompt, schema: AGENDA_SCHEMA, temperature: 0.4, maxTokens: 3000,
    });
    const real = (raw.real ?? []).slice(0, 3).map((a, i) => ({ id: `r${i + 1}`, label: String(a.label ?? '').slice(0, 200), effect: readEffect(a.effect, known), weight: Math.max(0.05, Number(a.weight) || 0.3) }));
    const total = real.reduce((s, a) => s + a.weight, 0) || 1;
    real.forEach((a) => { a.weight = Math.round((a.weight / total) * 100) / 100; });
    const roles = Object.fromEntries((raw.roles ?? []).filter((r) => r.role && known.has(String(r.character))).map((r) => [String(r.role), String(r.character)]));
    return NextResponse.json({
      declared: raw.declared ? { id: 'declared', label: String(raw.declared.label ?? '').slice(0, 200), effect: readEffect(raw.declared.effect, known), weight: 1 } : null,
      real, roles, reasoning: String(raw.reasoning ?? '').slice(0, 1200),
    });
  } catch (e) {
    return aiErrorResponse(e, 'Proposing agendas failed');
  }
}
