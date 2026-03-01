import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { query, isDbAvailable } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!(await isDbAvailable())) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  const { id } = await params;

  const res = await query(
    'SELECT id, title, final_state_manual, final_state_generated FROM cloud_items WHERE id = $1 AND user_id = $2',
    [id, session.user.id]
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
  const session = await auth();
  if (!session?.user?.id) {
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
    [id, session.user.id]
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
    const role = item.metadata?.role || '';
    const arc = item.metadata?.arc || '';
    // Stub — replace with real AI generation when provider is wired
    const generated = `[AI-generated final state for: "${item.title}"${role ? ` (${role})` : ''}]${arc ? ` Arc: ${arc}` : ''} — Placeholder. Connect an AI provider to generate real character final states.`;

    const res = await query(
      'UPDATE cloud_items SET final_state_generated = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, final_state_manual, final_state_generated',
      [generated, id]
    );
    return NextResponse.json({ finalState: res.rows[0] });
  }

  return NextResponse.json({ error: 'Invalid mode. Use "manual" or "generate".' }, { status: 400 });
}
