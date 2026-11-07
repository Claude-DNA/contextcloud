import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

/**
 * Publishes a cloud draft to ConteXtube (POST {CONTEXTUBE_URL}/api/v1/publish).
 * ConteXtube needs a publish key: CONTEXTUBE_PUBLISH_KEY must match a `studio:<secret>` entry in its PUBLISH_KEYS.
 */

type StudioLayer = { name?: string; type?: string; content?: string };

// Each Studio layer type goes to the ConteXtube layer that holds that kind of material.
// No type maps to L2, because ConteXtube requires every L2 idea to carry a source quote.
const LAYER_FOR_TYPE: Record<string, number> = {
  core: 1, // the essence
  cultural: 3, // connections to culture
  bridge: 3, // connections to other works
  context: 4, // interpretation
  reference: 5, // notes on sources
};

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const publishKey = process.env.CONTEXTUBE_PUBLISH_KEY;
    if (!publishKey) {
      return NextResponse.json({ error: 'Publishing to ConteXtube is not set up on this server yet.' }, { status: 503 });
    }

    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await req.json();
    const { draftId, type } = body as { draftId?: string; type?: string };
    let { title, description, layers } = body as { title?: string; description?: string; layers?: StudioLayer[] };

    // The visual editor sends only the draft id: read the layers from the saved draft.
    if ((!layers || layers.length === 0) && draftId) {
      const draft = await query(
        'SELECT title, description, layers_json FROM cloud_drafts WHERE id = $1 AND user_id = $2',
        [draftId, userId]
      );
      layers = (draft.rows[0]?.layers_json as StudioLayer[]) ?? [];
      title = title || (draft.rows[0]?.title as string);
      description = description || (draft.rows[0]?.description as string);
    }

    const filled = (layers ?? []).filter((l) => typeof l?.content === 'string' && l.content.trim());
    if (!title || filled.length === 0) {
      return NextResponse.json(
        { error: 'Add a title and write at least one layer before publishing.' },
        { status: 400 }
      );
    }

    const chunks = filled.map((l) => {
      const layer = LAYER_FOR_TYPE[l.type ?? ''] ?? 4;
      return {
        layer,
        type: layer === 5 ? 'meta' : 'idea',
        text: l.content!.trim(),
        importance: l.type === 'core' ? 0.9 : 0.5,
        standalone: true,
        metadata: { layerName: l.name ?? null, layerType: l.type ?? null, source: 'contextcloud.studio' },
      };
    });

    const author = await query('SELECT name, email FROM users WHERE id = $1', [userId]);
    const authorName = (author.rows[0]?.name as string) || (author.rows[0]?.email as string)?.split('@')[0] || 'Context Cloud';

    const base = (process.env.CONTEXTUBE_URL ?? 'https://contextube.ai').replace(/\/$/, '');
    const tubeResponse = await fetch(`${base}/api/v1/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publishKey}` },
      body: JSON.stringify({
        flow: slugify(authorName) || 'context-cloud',
        flow_name: authorName,
        creator_name: authorName,
        title,
        description: description || '',
        language: 'en',
        rights: 'own',
        tags: [type || 'cloud'],
        domains: [],
        chunks,
      }),
    });

    const tubeData = await tubeResponse.json().catch(() => ({}));
    if (!tubeResponse.ok) {
      const err = tubeData?.error;
      const details = Array.isArray(err?.details) ? ` (${err.details.map((d: { message: string }) => d.message).join('; ')})` : '';
      const message = (typeof err === 'string' ? err : err?.message) || 'Failed to publish to ConteXtube';
      return NextResponse.json({ error: message + details }, { status: tubeResponse.status });
    }

    if (draftId) {
      await query(
        `UPDATE cloud_drafts SET status = 'published', tube_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
        [tubeData.content?.slug || tubeData.content?.id || null, draftId, userId]
      );
    }

    return NextResponse.json({
      success: true,
      published: {
        id: tubeData.content?.id,
        slug: tubeData.content?.slug,
        url: `${base}/content/${tubeData.content?.slug}`,
      },
    });
  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
