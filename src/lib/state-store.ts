import { query } from '@/lib/db';
import { isAdmin } from '@/lib/admin';
import type { LibraryState } from '@/lib/state-maker';

export interface StateRow { id: string; user_id: string; work: string; character: string; state: LibraryState; in_library: boolean; review: string; created_at: string; by?: string | null }

/** Whether this user may review offers to the Studio library. */
export async function userIsAdmin(userId: string): Promise<boolean> {
  const u = (await query('SELECT email, role, email_verified FROM users WHERE id = $1', [userId])).rows[0] as { email?: string; role?: string; email_verified?: boolean } | undefined;
  return isAdmin(u ? { email: u.email, role: u.role, emailVerified: u.email_verified } : null);
}

/** A stored row as the library shows it: the row id is the state's id. */
export function rowToState(r: StateRow, source: 'mine' | 'studio'): LibraryState {
  return { ...r.state, id: r.id, work: r.work, character: r.character, source, review: r.review as LibraryState['review'], in_library: r.in_library, ...(r.by ? { by: r.by } : {}) };
}
