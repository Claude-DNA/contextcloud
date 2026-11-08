import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';
import { getGeminiKey, noKeyResponse } from '@/lib/ai-key';
import { generate } from '@/lib/gemini';

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  const res = await query(
    'SELECT id, title, final_state_manual, final_state_generated FROM cloud_items WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json({ finalState: res.rows[0] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json();
  const { mode, text } = body;

  // Verify item belongs to user
  const itemRes = await query(
    'SELECT * FROM cloud_items WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (itemRes.rows.length === 0) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  if (mode === 'manual') {
    const res = await query(
      'UPDATE cloud_items SET final_state_manual = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, final_state_manual, final_state_generated',
      [text, id]
    );
    return NextResponse.json({ finalState: res.rows[0] });
  }

  if (mode === 'generate') {
    const item = itemRes.rows[0];
    const apiKey = await getGeminiKey(userId);
    if (!apiKey) return noKeyResponse();
    const trans = await query(
      'SELECT text, weight, transform_type FROM cloud_item_transformations WHERE cloud_item_id = $1 ORDER BY created_at ASC',
      [id]
    );
    const kind = item.cloud_type === 'ideas' ? 'idea' : item.cloud_type === 'characters' ? 'character' : 'element';
    let generated: string;
    try {
      generated = (await generate({
        apiKey,
        temperature: 0.6,
        maxOutputTokens: 1024,
        prompt: `Describe where this story ${kind} ends up after everything that happens to it: its final state, in 3-5 sentences.
Stay faithful to what is written; mark anything you infer as inferred.

${kind.toUpperCase()}: ${item.title}
${String(item.content || '').slice(0, 4000)}

WHAT CHANGES IT (in order, with weights)
${trans.rows.map((t: { text: string; weight: number; transform_type: string }) => `- (${t.transform_type}, weight ${t.weight}) ${t.text}`).join('\n') || '(no transformations recorded)'}`,
      })).trim();
    } catch (e) {
      return NextResponse.json({ error: 'Generation failed', details: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }

    const res = await query(
      'UPDATE cloud_items SET final_state_generated = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, final_state_manual, final_state_generated',
      [generated, id]
    );
    return NextResponse.json({ finalState: res.rows[0] });
  }

  return NextResponse.json({ error: 'Invalid mode. Use "manual" or "generate".' }, { status: 400 });
}
