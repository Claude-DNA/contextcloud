import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await req.json();
    const { draftId, title, description, type, layers } = body;

    if (!title || !layers || !Array.isArray(layers) || layers.length === 0) {
      return NextResponse.json(
        { error: 'Title and at least one layer are required' },
        { status: 400 }
      );
    }

    // Convert layers into chunks for ContextTube's publish API
    const chunks = layers.map((layer: { name: string; type: string; content: string }, i: number) => ({
      layer: i + 1,
      type: layer.type || 'idea',
      text: layer.content,
      importance: 0.5,
      standalone: true,
      metadata: { layerName: layer.name, layerType: layer.type },
    }));

    // POST to ContextTube publish API
    const tubeResponse = await fetch('https://contextube.ai/api/v1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || '',
        chunks,
        tags: [type || 'cloud'],
        domains: [],
      }),
    });

    if (!tubeResponse.ok) {
      const error = await tubeResponse.json().catch(() => ({ error: 'Publish failed' }));
      return NextResponse.json(
        { error: error.error || 'Failed to publish to ContextTube' },
        { status: tubeResponse.status }
      );
    }

    const tubeData = await tubeResponse.json();

    // Update local draft status if we have a draftId
    if (draftId) {
      await query(
        `UPDATE cloud_drafts SET status = 'published', tube_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
        [tubeData.content?.id || null, draftId, userId]
      );
    }

    return NextResponse.json({
      success: true,
      published: {
        id: tubeData.content?.id,
        slug: tubeData.content?.slug,
        url: `https://contextube.ai/content/${tubeData.content?.slug}`,
      },
    });
  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
