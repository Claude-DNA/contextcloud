import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { parseStoredFormula, type StateFormula } from '@/lib/state-formula';

/** GET /api/v1/user/state-library → { formulas: [...] }: the state formulas this writer has saved. */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const row = (await query('SELECT state_library FROM users WHERE id = $1', [userId])).rows[0] as { state_library?: unknown } | undefined;
  return NextResponse.json({ formulas: Array.isArray(row?.state_library) ? row.state_library : [] });
}

/** PUT /api/v1/user/state-library { formulas: [...] } replaces the saved list (up to 200 formulas). */
export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const body = (await req.json().catch(() => ({}))) as { formulas?: unknown };
  if (!Array.isArray(body.formulas)) return NextResponse.json({ error: '"formulas" must be a list.' }, { status: 400 });
  const seen = new Set<string>();
  const formulas: StateFormula[] = [];
  for (const x of body.formulas.slice(0, 200)) {
    const f = parseStoredFormula(x);
    if (!f || !f.id || seen.has(f.id)) continue;
    seen.add(f.id);
    const color = (x as { color?: unknown }).color;
    formulas.push({ ...f, isPreset: undefined, ...(typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? { color } : {}) });
  }
  await query('UPDATE users SET state_library = $1::jsonb WHERE id = $2', [JSON.stringify(formulas), userId]);
  return NextResponse.json({ formulas });
}
