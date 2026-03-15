import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// GET /api/v1/docs/api
// Serves the full Context Cloud API Reference as plain markdown.
// Public endpoint — no auth required. Readable by AI agents and humans.
export async function GET() {
  try {
    const specPath = join(process.cwd(), 'src/app/api/v1/docs/API_REFERENCE.md');
    const content = readFileSync(specPath, 'utf-8');
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
  }
}
