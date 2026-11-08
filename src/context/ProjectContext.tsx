'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface Project {
  id: string;
  title: string;
  description: string;
  created_at: string;
  item_count: number;
  /** Set once the project has been published as a ConteXtube cloud. */
  cloud_slug?: string | null;
  cloud_published_at?: string | null;
}

interface ProjectContextValue {
  activeProjectId: string | null;
  /** True once the saved selection has been read. Pages that load per-project data wait for it,
   *  so they don't first load "no project" and race the real request. */
  projectReady: boolean;
  setActiveProjectId: (id: string | null) => void;
  projects: Project[];
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue>({
  activeProjectId: null,
  projectReady: false,
  setActiveProjectId: () => {},
  projects: [],
  refreshProjects: async () => {},
});

const LS_KEY = 'cc_active_project_id';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectReady, setProjectReady] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setActiveProjectIdState(stored);
    } catch { /* ignore */ }
    setProjectReady(true);
  }, []);

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveProjectIdState(id);
    try {
      if (id) {
        localStorage.setItem(LS_KEY, id);
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch projects on mount
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  return (
    <ProjectContext.Provider value={{ activeProjectId, projectReady, setActiveProjectId, projects, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
