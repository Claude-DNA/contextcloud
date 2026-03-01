'use client';

import { useState, useRef } from 'react';

interface Stats {
  arc: { created: number; chapters: number; plots: number };
  characters: number;
  stages: number;
  world: number;
  references: number;
}

interface FoamImportModalProps {
  onClose: () => void;
  onDone?: (stats: Stats) => void;
}

type Phase = 'idle' | 'reading' | 'extracting' | 'saving' | 'done' | 'error';

export default function FoamImportModal({ onClose, onDone }: FoamImportModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runImport = async (file: File) => {
    setFileName(file.name);
    setPhase('reading');
    setError('');

    try {
      const form = new FormData();
      form.append('file', file);

      setPhase('extracting');

      const res = await fetch('/api/v1/import/foam-clouds', {
        method: 'POST',
        body: form,
      });

      setPhase('saving');

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      setStats(data.stats);
      setPhase('done');
      onDone?.(data.stats);
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const handleFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.md') && !name.endsWith('.txt') && !name.endsWith('.docx')) {
      setError('Only .md, .txt, and .docx files are supported');
      setPhase('error');
      return;
    }
    runImport(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const phaseLabel: Record<Phase, string> = {
    idle: '',
    reading: 'Reading file…',
    extracting: 'Gemini is analyzing the document — extracting characters, stages, world, references, arc…',
    saving: 'Saving to your clouds…',
    done: 'Done!',
    error: '',
  };

  const totalImported = stats
    ? stats.characters + stats.stages + stats.world + stats.references + stats.arc.plots
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card-bg rounded-2xl shadow-2xl border border-border w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import Story Document</h2>
            <p className="text-xs text-muted mt-0.5">
              Parses your story file and populates all cloud pages automatically
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-xl leading-none ml-4"
            disabled={phase === 'extracting' || phase === 'saving'}
          >
            &times;
          </button>
        </div>

        <div className="p-6">
          {/* Drop zone — only shown when idle or error */}
          {(phase === 'idle' || phase === 'error') && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-accent bg-accent/5'
                  : 'border-border hover:border-accent/50 hover:bg-gray-50'
              }`}
            >
              <div className="text-3xl mb-3">📄</div>
              <p className="text-sm font-medium text-foreground mb-1">
                Drop your story file here
              </p>
              <p className="text-xs text-muted">
                .md, .txt, or .docx — supports FOAM-BY-CHAPTER format
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".md,.txt,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          )}

          {/* Progress — shown during processing */}
          {(phase === 'reading' || phase === 'extracting' || phase === 'saving') && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="text-sm font-medium text-foreground truncate flex-1">{fileName}</div>
              </div>
              <div className="space-y-2">
                <StepRow label="Reading file" active={phase === 'reading'} done={phase !== 'reading'} />
                <StepRow label="Gemini extraction — characters, stages, world, references, arc" active={phase === 'extracting'} done={phase === 'saving'} />
                <StepRow label="Saving to clouds" active={phase === 'saving'} done={false} />
              </div>
              <p className="text-xs text-muted italic">{phaseLabel[phase]}</p>
            </div>
          )}

          {/* Done */}
          {phase === 'done' && stats && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    {totalImported} items imported
                  </p>
                  <p className="text-xs text-green-600">
                    "{fileName}" processed successfully
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {stats.arc.created > 0 || stats.arc.chapters > 0 ? (
                  <StatCard emoji="📖" label="Arc Cloud" value={`${stats.arc.chapters} chapters, ${stats.arc.plots} plots`} color="blue" />
                ) : null}
                {stats.characters > 0 && (
                  <StatCard emoji="👤" label="Characters" value={`${stats.characters} characters`} color="indigo" />
                )}
                {stats.stages > 0 && (
                  <StatCard emoji="🎭" label="Stage Cloud" value={`${stats.stages} locations`} color="green" />
                )}
                {stats.world > 0 && (
                  <StatCard emoji="🌍" label="World Cloud" value={`${stats.world} concepts`} color="cyan" />
                )}
                {stats.references > 0 && (
                  <StatCard emoji="📑" label="References" value={`${stats.references} references`} color="orange" />
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  View clouds
                </button>
                <button
                  onClick={() => {
                    setPhase('idle');
                    setStats(null);
                    setFileName('');
                    setError('');
                  }}
                  className="px-4 py-2 border border-border text-foreground rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Import another
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-sm text-red-700 font-medium">Import failed</p>
              <p className="text-xs text-red-500 mt-1">{error}</p>
              <button
                onClick={() => { setPhase('idle'); setError(''); }}
                className="mt-3 text-xs text-red-600 underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Supported clouds legend */}
        {phase === 'idle' && (
          <div className="px-6 pb-5">
            <p className="text-xs text-muted mb-2">Will populate:</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { emoji: '📖', label: 'Arc Cloud', color: 'bg-blue-50 text-blue-700' },
                { emoji: '👤', label: 'Characters', color: 'bg-indigo-50 text-indigo-700' },
                { emoji: '🎭', label: 'Stage Cloud', color: 'bg-green-50 text-green-700' },
                { emoji: '🌍', label: 'World Cloud', color: 'bg-cyan-50 text-cyan-700' },
                { emoji: '📑', label: 'References', color: 'bg-orange-50 text-orange-700' },
              ].map(t => (
                <span key={t.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>
                  {t.emoji} {t.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
        active ? 'bg-accent text-white animate-pulse'
        : done  ? 'bg-green-100 text-green-600'
        : 'bg-gray-100 text-gray-400'
      }`}>
        {done ? '✓' : active ? '…' : '·'}
      </div>
      <span className={`text-sm ${active ? 'text-foreground' : done ? 'text-muted' : 'text-muted'}`}>{label}</span>
    </div>
  );
}

function StatCard({ emoji, label, value, color }: { emoji: string; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    indigo: 'bg-indigo-50 border-indigo-100',
    green: 'bg-green-50 border-green-100',
    cyan: 'bg-cyan-50 border-cyan-100',
    orange: 'bg-orange-50 border-orange-100',
  };
  return (
    <div className={`p-3 rounded-xl border ${colors[color] || 'bg-gray-50 border-border'}`}>
      <div className="text-lg mb-1">{emoji}</div>
      <div className="text-xs font-semibold text-foreground">{label}</div>
      <div className="text-xs text-muted">{value}</div>
    </div>
  );
}
