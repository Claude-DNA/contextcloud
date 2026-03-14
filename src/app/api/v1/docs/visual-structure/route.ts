import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// GET /api/v1/docs/visual-structure
// Serves the Visual Editor Structure Spec as plain text (Markdown).
// Public endpoint — no auth required. Readable by AI agents and humans.
export async function GET() {
  try {
    const specPath = join(process.cwd(), 'src/app/api/v1/docs/VISUAL_STRUCTURE_SPEC.md');
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
