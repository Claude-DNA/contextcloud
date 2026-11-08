/**
 * The Ideas page's API shape ({ id, text, weight, locked, image_url, … }) over cloud_items with
 * cloud_type 'ideas'. Ideas used to live in a separate `ideas` table that uploads, chat and
 * Quick Capture never wrote to, so extracted ideas didn't appear on the Ideas page.
 */
export interface IdeaRow {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  sort_order: number;
  final_state_manual: string | null;
  final_state_generated: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToIdea(r: IdeaRow) {
  const m = r.metadata ?? {};
  return {
    id: r.id,
    text: r.content?.trim() ? r.content : r.title,
    title: r.title,
    weight: typeof m.weight === 'number' ? m.weight : 1,
    locked: m.locked === true,
    image_url: typeof m.image_url === 'string' ? m.image_url : null,
    final_state_manual: r.final_state_manual,
    final_state_generated: r.final_state_generated,
    sort_order: r.sort_order,
    project_id: r.project_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** A short title from an idea's text: its first sentence, at most 80 characters. */
export function titleFrom(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s|\n/)[0] ?? text;
  return first.length > 80 ? first.slice(0, 79).trimEnd() + '…' : first;
}

export const IDEA_COLUMNS =
  'id, title, content, metadata, sort_order, final_state_manual, final_state_generated, project_id, created_at, updated_at';
