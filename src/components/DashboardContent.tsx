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
  updated_at: string;
}

export default function DashboardContent() {
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
      .then((data) => setDrafts(data.drafts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
          <div className="grid grid-cols-3 gap-4 mt-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold mb-2">Welcome to ContextCloud Studio</h1>
          <p className="text-muted mb-6">
            Build structured context clouds and flows, then publish to ContextTube.
          </p>
          <Link
            href="/auth/signin"
            className="inline-flex px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            Sign in to get started
          </Link>
        </div>
      </div>
    );
  }

  const draftItems = drafts.filter((d) => d.status === 'draft');
  const publishedItems = drafts.filter((d) => d.status === 'published');

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">
          Welcome back{session.user?.name ? `, ${session.user.name}` : ''}
        </h1>
        <p className="text-muted text-sm mt-1">Manage your clouds and flows</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Link
          href="/workspace/traditional?type=cloud"
          className="group p-5 rounded-xl border border-border hover:border-accent/30 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-accent flex items-center justify-center mb-3 group-hover:bg-accent group-hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div className="font-medium text-sm">New Cloud</div>
          <div className="text-xs text-muted mt-1">Create a context cloud with layers</div>
        </Link>

        <Link
          href="/workspace/traditional?type=flow"
          className="group p-5 rounded-xl border border-border hover:border-accent/30 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-accent flex items-center justify-center mb-3 group-hover:bg-accent group-hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          <div className="font-medium text-sm">New Flow</div>
          <div className="text-xs text-muted mt-1">Build a shareable context flow</div>
        </Link>

        <Link
          href="/workspace/visual"
          className="group p-5 rounded-xl border border-border hover:border-accent/30 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-accent flex items-center justify-center mb-3 group-hover:bg-accent group-hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
            </svg>
          </div>
          <div className="font-medium text-sm">Visual Editor</div>
          <div className="text-xs text-muted mt-1">Node-based canvas workspace</div>
        </Link>
      </div>

      {/* Drafts */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Drafts</h2>
        {loading ? (
          <div className="animate-pulse h-20 bg-gray-100 rounded-xl" />
        ) : draftItems.length === 0 ? (
          <div className="text-sm text-muted py-8 text-center border border-dashed border-border rounded-xl">
            No drafts yet. Create your first cloud or flow above.
          </div>
        ) : (
          <div className="grid gap-3">
            {draftItems.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </div>
        )}
      </section>

      {/* Published */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Published</h2>
        {loading ? (
          <div className="animate-pulse h-20 bg-gray-100 rounded-xl" />
        ) : publishedItems.length === 0 ? (
          <div className="text-sm text-muted py-8 text-center border border-dashed border-border rounded-xl">
            Nothing published yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {publishedItems.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DraftCard({ draft }: { draft: Draft }) {
  return (
    <Link
      href={`/workspace/traditional?id=${draft.id}`}
      className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-accent/30 hover:shadow-sm transition-all"
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${
          draft.type === 'cloud'
            ? 'bg-indigo-50 text-indigo-600'
            : 'bg-emerald-50 text-emerald-600'
        }`}
      >
        {draft.type === 'cloud' ? 'CL' : 'FL'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{draft.title || 'Untitled'}</div>
        <div className="text-xs text-muted truncate">{draft.description || 'No description'}</div>
      </div>
      <div className="text-xs text-muted whitespace-nowrap">
        {new Date(draft.updated_at).toLocaleDateString()}
      </div>
      <div
        className={`text-xs px-2 py-0.5 rounded-full ${
          draft.status === 'published'
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-gray-100 text-gray-500'
        }`}
      >
        {draft.status}
      </div>
    </Link>
  );
}
