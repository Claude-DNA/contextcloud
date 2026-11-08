import { NextRequest } from 'next/server';
import { query, isDbAvailable } from '@/lib/db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/images/<id> — a stored illustration, public so published clouds can show it.
 * Ids are random UUIDs; files never change, so they are cached for a year.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.replace(/\.(webp|png|jpe?g)$/i, '');
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  await isDbAvailable();
  const r = await query('SELECT mime, bytes FROM images WHERE id = $1', [id]);
  const row = r.rows[0] as { mime: string; bytes: Buffer } | undefined;
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(row.bytes), {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
