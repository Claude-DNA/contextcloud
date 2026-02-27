'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card-bg">
      <div className="text-sm text-muted">
        {/* Breadcrumb or page title — filled by the page */}
      </div>

      <div className="flex items-center gap-4">
        {status === 'loading' ? (
          <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
        ) : session?.user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground/70">{session.user.name || session.user.email}</span>
            {session.user.image ? (
              <img
                src={session.user.image}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-medium">
                {(session.user.name || session.user.email || '?')[0].toUpperCase()}
              </div>
            )}
            <button
              onClick={() => signOut()}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            href="/auth/signin"
            className="px-4 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
