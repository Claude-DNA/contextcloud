'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { tr } from '@/i18n/client';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useProject } from '@/context/ProjectContext';
import CastPanel from '@/components/engine/CastPanel';
import ScenesPanel from '@/components/engine/ScenesPanel';
import RunPanel from '@/components/engine/RunPanel';
import type { EngineCharacter, EngineScene } from '@/components/engine/shared';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/engine/types';

type Tab = 'cast' | 'scenes' | 'run';

export default function CharacterEnginePage() {
  const { activeProjectId, projectReady, projects } = useProject();
  const [tab, setTab] = useState<Tab>('cast');
  const [characters, setCharacters] = useState<EngineCharacter[] | null>(null);
  const [scenes, setScenes] = useState<EngineScene[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<{ text: string; settings?: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/engine${activeProjectId ? `?project_id=${activeProjectId}` : ''}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError({ text: d.error || tr('The engine data could not be loaded.') }); setCharacters([]); return; }
    setCharacters(d.characters ?? []);
    setScenes(d.scenes ?? []);
    setSettings({ ...DEFAULT_SETTINGS, ...(d.settings ?? {}) });
  }, [activeProjectId]);

  useEffect(() => { if (projectReady) void load(); }, [projectReady, load]);

  const onError = (text: string, settingsLink?: boolean) => setError({ text, settings: settingsLink });
  const project = projects.find((p) => p.id === activeProjectId);
  const tabs: { id: Tab; text: string; hint: string }[] = [
    { id: 'cast', text: tr('1. Cast'), hint: tr('who they are, what they want') },
    { id: 'scenes', text: tr('2. Scenes'), hint: tr('what happens, approved by you') },
    { id: 'run', text: tr('3. Run'), hint: tr('positions, ledger, questions') },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-60 flex flex-1 flex-col">
        <Header />
        <div className="w-full flex-1 p-8">
          <div className="mx-auto max-w-6xl">
            <h1 className="mb-1 text-xl font-semibold text-foreground">{tr('Character Engine')}</h1>
            <p className="mb-6 max-w-3xl text-sm text-muted">
              {tr('Tracks where every character stands, scene by scene: good or evil by their deeds and hidden agendas, love or fear, how honest, what they still carry. It asks where a deed is not earned. It never decides what a character must do.')}
              {' '}{project ? tr('Project: {name}.', { name: project.title }) : tr('No project open: using the items outside projects.')}
            </p>

            {error && (
              <p role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <span>{error.text} {error.settings && <Link href="/workspace/settings" className="font-medium underline">{tr('Open Settings')}</Link>}</span>
                <button type="button" onClick={() => setError(null)} aria-label={tr('Dismiss')} className="text-red-700">×</button>
              </p>
            )}

            <div role="tablist" aria-label={tr('Engine steps')} className="mb-6 flex flex-wrap gap-2 border-b border-border">
              {tabs.map((t) => (
                <button key={t.id} role="tab" type="button" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 px-3 pb-2 text-left text-sm ${tab === t.id ? 'border-accent font-medium text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}>
                  {t.text}<span className="block text-xs font-normal text-muted">{t.hint}</span>
                </button>
              ))}
            </div>

            {!characters ? (
              <p className="text-sm text-muted" role="status">{tr('Loading…')}</p>
            ) : (
              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'cast' && <CastPanel characters={characters} onError={onError} onSaved={(c) => setCharacters((cs) => (cs ?? []).map((x) => (x.id === c.id ? c : x)))} />}
                {tab === 'scenes' && <ScenesPanel scenes={scenes} characters={characters} onError={onError} onSaved={(s) => setScenes((ss) => ss.map((x) => (x.id === s.id ? s : x)))} />}
                {tab === 'run' && <RunPanel projectId={activeProjectId} characters={characters} settings={settings} onSettings={setSettings} onError={(t) => onError(t)} />}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
