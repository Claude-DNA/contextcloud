'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface Project {
  id: string;
  title: string;
  description: string;
  created_at: string;
  item_count: number;
}

interface ProjectContextValue {
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  projects: Project[];
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue>({
  activeProjectId: null,
  setActiveProjectId: () => {},
  projects: [],
  refreshProjects: async () => {},
});

const LS_KEY = 'cc_active_project_id';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setActiveProjectIdState(stored);
    } catch { /* ignore */ }
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
    <ProjectContext.Provider value={{ activeProjectId, setActiveProjectId, projects, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
