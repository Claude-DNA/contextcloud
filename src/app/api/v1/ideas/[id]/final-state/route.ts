import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { query, isDbAvailable } from '@/lib/db';

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
    'SELECT id, final_state_manual, final_state_generated FROM ideas WHERE id = $1 AND project_id = $2',
    [id, userId]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
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

  // Verify idea belongs to user
  const ideaRes = await query(
    'SELECT * FROM ideas WHERE id = $1 AND project_id = $2',
    [id, userId]
  );
  if (ideaRes.rows.length === 0) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  }

  if (mode === 'manual') {
    const res = await query(
      'UPDATE ideas SET final_state_manual = $1, updated_at = NOW() WHERE id = $2 RETURNING id, final_state_manual, final_state_generated',
      [text, id]
    );
    return NextResponse.json({ finalState: res.rows[0] });
  }

  if (mode === 'generate') {
    // Stub: AI generation would go here. For now, generate a simple summary.
    const idea = ideaRes.rows[0];
    const generated = `[AI-generated final state for: "${idea.text.substring(0, 100)}..."] — This is a placeholder. Connect an AI provider to generate real predictions.`;

    const res = await query(
      'UPDATE ideas SET final_state_generated = $1, updated_at = NOW() WHERE id = $2 RETURNING id, final_state_manual, final_state_generated',
      [generated, id]
    );
    return NextResponse.json({ finalState: res.rows[0] });
  }

  return NextResponse.json({ error: 'Invalid mode. Use "manual" or "generate".' }, { status: 400 });
}
