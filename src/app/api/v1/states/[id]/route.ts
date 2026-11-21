import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { ensureSchema } from '@/lib/migrations';
import { rowToState, userIsAdmin, type StateRow } from '@/lib/state-store';

/**
 * PATCH /api/v1/states/{id}
 * The owner: { library: bool } keeps or removes it from their library; { submit: true } offers it to the Studio library.
 * An admin: { review: "approved" | "rejected" } decides an offer.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await isDbAvailable())) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  await ensureSchema().catch(() => {});
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { library?: unknown; submit?: unknown; review?: unknown };
  const row = (await query(`SELECT * FROM character_states WHERE id = $1`, [id])).rows[0] as StateRow | undefined;
  if (!row) return NextResponse.json({ error: 'No such state.' }, { status: 404 });

  if (body.review === 'approved' || body.review === 'rejected') {
    if (!(await userIsAdmin(userId))) return NextResponse.json({ error: 'Only a reviewer can approve or reject.' }, { status: 403 });
    const r = (await query(`UPDATE character_states SET review = $1, reviewed_at = NOW() WHERE id = $2 RETURNING *`, [body.review, id])).rows[0] as StateRow;
    return NextResponse.json({ state: rowToState(r, 'studio') });
  }

  if (row.user_id !== userId) return NextResponse.json({ error: 'No such state.' }, { status: 404 });
  const library = typeof body.library === 'boolean' ? body.library : row.in_library;
  const review = body.submit === true && (row.review === 'none' || row.review === 'rejected') ? 'pending' : row.review;
  if (!library && (review === 'none' || review === 'rejected')) {
    // Neither kept nor offered: nothing left to hold it for.
    await query(`DELETE FROM character_states WHERE id = $1`, [id]);
    return NextResponse.json({ deleted: true });
  }
  const r = (await query(`UPDATE character_states SET in_library = $1, review = $2 WHERE id = $3 RETURNING *`, [library, review, id])).rows[0] as StateRow;
  return NextResponse.json({ state: rowToState(r, 'mine') });
}
