'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useProject } from '@/context/ProjectContext';

export default function Header() {
  const { data: session, status } = useSession();
  const { activeProjectId, setActiveProjectId, projects, refreshProjects } = useProject();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find(p => p.id === activeProjectId);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        await refreshProjects();
        setActiveProjectId(data.project.id);
        setNewTitle('');
        setShowNewModal(false);
      }
    } catch { /* ignore */ }
    setCreating(false);
  };

  return (
    <>
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card-bg">
        {/* Project switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 text-sm text-foreground hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span className="font-medium truncate max-w-[200px]">
              {activeProject ? activeProject.title : 'All Projects'}
            </span>
            <svg className={`w-3.5 h-3.5 text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-border rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="py-1">
                <button
                  onClick={() => { setActiveProjectId(null); setDropdownOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${!activeProjectId ? 'text-accent font-medium' : 'text-foreground'}`}
                >
                  All Projects
                </button>
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setActiveProjectId(p.id); setDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${activeProjectId === p.id ? 'text-accent font-medium' : 'text-foreground'}`}
                  >
                    <span className="truncate">{p.title}</span>
                    <span className="text-xs text-muted ml-2 shrink-0">{p.item_count}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-border">
                <button
                  onClick={() => { setDropdownOpen(false); setShowNewModal(true); }}
                  className="w-full text-left px-4 py-2 text-sm text-accent hover:bg-gray-50 transition-colors font-medium"
                >
                  + New Project
                </button>
              </div>
            </div>
          )}
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

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowNewModal(false)}>
          <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-foreground mb-4">New Project</h2>
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Project title..."
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors bg-white"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => { setShowNewModal(false); setNewTitle(''); }}
                className="px-4 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-gray-50 transition-colors border border-border"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
