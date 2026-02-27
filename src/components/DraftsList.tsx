'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Draft {
  id: string;
  title: string;
  description: string;
  type: 'cloud' | 'flow';
  status: 'draft' | 'published';
  tube_id: string | null;
  updated_at: string;
}

export default function DraftsList({ filter }: { filter: 'draft' | 'published' }) {
  const { data: session, status } = useSession();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    fetch('/api/v1/drafts')
      .then((r) => r.json())
      .then((data) => setDrafts((data.drafts || []).filter((d: Draft) => d.status === filter)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, filter]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this draft?')) return;
    await fetch('/api/v1/drafts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setDrafts(drafts.filter((d) => d.id !== id));
  }

  const heading = filter === 'draft' ? 'Drafts' : 'Published';

  if (!session && status !== 'loading') {
    return (
      <div className="p-8 text-center text-muted">Please sign in to view your {heading.toLowerCase()}.</div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-xl font-semibold mb-6">{heading}</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-sm text-muted py-12 text-center border border-dashed border-border rounded-xl">
          {filter === 'draft' ? 'No drafts yet.' : 'Nothing published yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-accent/20 transition-all"
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${
                  d.type === 'cloud'
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {d.type === 'cloud' ? 'CL' : 'FL'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{d.title || 'Untitled'}</div>
                <div className="text-xs text-muted truncate">{d.description || 'No description'}</div>
              </div>
              <div className="text-xs text-muted whitespace-nowrap">
                {new Date(d.updated_at).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/workspace/traditional?id=${d.id}`}
                  className="px-3 py-1 text-xs border border-border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Edit
                </Link>
                {d.tube_id && (
                  <a
                    href={`https://contextube.ai/content/${d.tube_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 text-xs text-accent border border-accent/20 rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    View
                  </a>
                )}
                {filter === 'draft' && (
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="px-3 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
