import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { cleanLibraryState } from '@/lib/state-maker';
import { rowToState, userIsAdmin, type StateRow } from '@/lib/state-store';

/**
 * GET /api/v1/states → { mine: [state], studio: [state], pending?: [state], admin }
 * mine: the writer's own library. studio: states approved for everyone. pending: offers waiting for review (admins only).
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const admin = await userIsAdmin(userId);
  const [mine, studio, pending] = await Promise.all([
    query(`SELECT * FROM character_states WHERE user_id = $1 AND in_library ORDER BY created_at DESC`, [userId]),
    query(`SELECT * FROM character_states WHERE review = 'approved' ORDER BY work, character, created_at`),
    admin
      ? query(`SELECT s.*, COALESCE(u.name, u.email) AS by FROM character_states s JOIN users u ON u.id = s.user_id WHERE s.review = 'pending' ORDER BY s.created_at`)
      : Promise.resolve({ rows: [] }),
  ]);
  return NextResponse.json({
    mine: (mine.rows as StateRow[]).map((r) => rowToState(r, 'mine')),
    studio: (studio.rows as StateRow[]).map((r) => rowToState(r, 'studio')),
    ...(admin ? { pending: (pending.rows as StateRow[]).map((r) => rowToState(r, 'studio')) } : {}),
    admin,
  });
}

/**
 * POST /api/v1/states { states: [{ state, library: bool, submit: bool }] } (up to 10)
 * library: keep it in the writer's library. submit: offer it to the Studio library, where it appears once approved.
 * → { saved: [state] }
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const body = (await req.json().catch(() => ({}))) as { states?: unknown };
  if (!Array.isArray(body.states)) return NextResponse.json({ error: '"states" must be a list.' }, { status: 400 });
  const count = Number((await query(`SELECT COUNT(*) AS n FROM character_states WHERE user_id = $1`, [userId])).rows[0]?.n ?? 0);
  const saved = [];
  for (const item of body.states.slice(0, 10)) {
    const o = item as { state?: unknown; library?: unknown; submit?: unknown };
    const s = cleanLibraryState(o?.state);
    const library = o?.library === true;
    const submit = o?.submit === true;
    if (!s || (!library && !submit)) continue;
    if (count + saved.length >= 1000) return NextResponse.json({ error: 'Your library is full (1,000 states). Remove some first.', saved }, { status: 400 });
    const { id: _ignored, work, character, ...state } = s;
    void _ignored;
    const row = (await query(
      `INSERT INTO character_states (user_id, work, character, state, in_library, review) VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING *`,
      [userId, work, character, JSON.stringify(state), library, submit ? 'pending' : 'none'],
    )).rows[0] as StateRow;
    saved.push(rowToState(row, 'mine'));
  }
  return NextResponse.json({ saved });
}
