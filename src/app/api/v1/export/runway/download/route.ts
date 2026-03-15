import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { buildManifest } from '../route';
import { noKeyResponse } from '@/lib/ai-key';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await buildManifest(userId);

  if ('error' in result) {
    if (result.error === 'BYOT_REQUIRED') return noKeyResponse();
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const manifest = result.manifest;
  const filename = `${(manifest.project || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}-runway-manifest.json`;

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
