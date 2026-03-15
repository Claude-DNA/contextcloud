'use client';

import { useRef, useState, useCallback } from 'react';

// ─── Story Structures ────────────────────────────────────────────────────────

export interface StoryStructure {
  id: string;
  name: string;
  description: string;
  examples: string[];
  icon: string;
  beats: string[];   // pre-seeded arc beat titles (empty = let AI discover)
}

export const STORY_STRUCTURES: StoryStructure[] = [
  {
    id: 'three_act',
    name: 'Three Act',
    description: 'Setup → Confrontation → Resolution',
    examples: ['Star Wars', 'The Matrix', 'Jurassic Park'],
    icon: '🎬',
    beats: ['Act 1: Setup', 'Act 2: Rising Stakes', 'Midpoint', 'Act 2B: Dark Turn', 'Act 3: Resolution'],
  },
  {
    id: 'heros_journey',
    name: "Hero's Journey",
    description: 'Ordinary world → Call → Transformation → Return',
    examples: ['The Lord of the Rings', 'Harry Potter', 'The Lion King'],
    icon: '⚔️',
    beats: ['Ordinary World', 'Call to Adventure', 'Crossing the Threshold', 'Tests & Allies', 'The Ordeal', 'The Reward', 'The Road Back', 'Return'],
  },
  {
    id: 'save_the_cat',
    name: 'Save the Cat',
    description: "Blake Snyder's 15-beat sheet",
    examples: ['The Dark Knight', 'Avengers', 'Die Hard'],
    icon: '🐱',
    beats: ['Opening Image', 'Theme Stated', 'Set-Up', 'Catalyst', 'Debate', 'Break into Two', 'Fun & Games', 'Midpoint', 'Bad Guys Close In', 'All is Lost', 'Dark Night', 'Break into Three', 'Finale', 'Final Image'],
  },
  {
    id: 'freytag',
    name: "Freytag's Pyramid",
    description: 'Classic dramatic arc',
    examples: ['Hamlet', 'Macbeth', 'Breaking Bad'],
    icon: '🔺',
    beats: ['Exposition', 'Rising Action', 'Climax', 'Falling Action', 'Denouement'],
  },
  {
    id: 'voyage_return',
    name: 'Voyage & Return',
    description: 'Into strange world — back changed',
    examples: ['The Wizard of Oz', 'Alice in Wonderland', 'The Hobbit'],
    icon: '🌀',
    beats: ['The Ordinary World', 'Entering the Other World', 'Initial Wonder', 'Frustration & Threat', 'The Nightmare', 'Escape & Return'],
  },
  {
    id: 'man_in_hole',
    name: 'Man in a Hole',
    description: 'Fall into trouble — climb out better',
    examples: ['Cast Away', 'The Martian', '127 Hours'],
    icon: '🕳️',
    beats: ['Ordinary Life', 'The Fall', 'Struggle', 'Turning Point', 'Climbing Out', 'Better Than Before'],
  },
  {
    id: 'rags_to_riches',
    name: 'Rags to Riches',
    description: 'Rise → fall → rise again stronger',
    examples: ['Cinderella', 'The Pursuit of Happyness', 'Rocky'],
    icon: '✨',
    beats: ['The Low Point', 'First Rise', 'Initial Success', 'The Fall', 'The Struggle', 'True Victory'],
  },
  {
    id: 'pas',
    name: 'Problem → Agitate → Solve',
    description: 'Business & pitch storytelling',
    examples: ['Pitch decks', 'Case studies', 'Sales narratives'],
    icon: '💼',
    beats: ['The Problem', 'Why It Matters', 'Attempts That Failed', 'The Solution', 'Proof It Works', 'Call to Action'],
  },
  {
    id: 'ai_detect',
    name: 'AI-Detect',
    description: 'AI analyzes your files and recommends the best structure',
    examples: [],
    icon: '🤖',
    beats: [],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Provide your own beat sheet or notes',
    examples: [],
    icon: '🔮',
    beats: [],
  },
];

// ─── Temperature presets ──────────────────────────────────────────────────────

const TEMP_PRESETS = [
  { value: 0.0, label: 'Strict Mirror', desc: 'Extraction only — no suggestions, no invention' },
  { value: 0.5, label: 'Balanced',      desc: 'Extraction + light co-author suggestions' },
  { value: 0.8, label: 'Co-Author',     desc: 'Full creative collaboration — fill gaps, suggest ideas' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export type ExtractionMode = 'structure' | 'character';

interface UploadWizardProps {
  onClose: () => void;
  onGenerate: (files: File[], structure: StoryStructure, temperature: number, mode: ExtractionMode) => void;
  importing?: boolean;
}

type Step = 'files' | 'mode' | 'structure' | 'temperature' | 'generate';
// structure mode: files → mode → structure → temperature → generate
// character mode: files → mode → temperature → generate
function getSteps(mode: ExtractionMode): Step[] {
  return mode === 'character'
    ? ['files', 'mode', 'temperature', 'generate']
    : ['files', 'mode', 'structure', 'temperature', 'generate'];
}

export default function UploadWizard({ onClose, onGenerate, importing = false }: UploadWizardProps) {
  const [step, setStep]               = useState<Step>('files');
  const [files, setFiles]             = useState<File[]>([]);
  const [mode, setMode]               = useState<ExtractionMode>('structure');
  const [structure, setStructure]     = useState<StoryStructure>(STORY_STRUCTURES[0]);
  const [temperature, setTemperature] = useState(0.5);
  const [dragging, setDragging]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const STEPS       = getSteps(mode);
  const stepIndex   = STEPS.indexOf(step);
  const canAdvance  = step === 'files' ? files.length > 0 : true;

  // ── File handling ──────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const accepted = Array.from(incoming).filter(f =>
      /\.(txt|md|docx|pdf)$/i.test(f.name)
    );
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...accepted.filter(f => !names.has(f.name))];
    });
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const next = () => {
    if (step === 'generate') {
      onGenerate(files, structure, temperature, mode);
    } else if (step === 'mode') {
      // switching mode resets defaults
      if (mode === 'character') setTemperature(0.5);
      else setTemperature(0.0);
      setStep(STEPS[stepIndex + 1]);
    } else {
      setStep(STEPS[stepIndex + 1]);
    }
  };

  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  // ── Step labels ────────────────────────────────────────────────────────────

  const STEP_LABELS: Record<Step, string> = {
    files:       '1. Choose Files',
    mode:        '2. Choose Mode',
    structure:   '3. Choose Structure',
    temperature: mode === 'character' ? '3. Set Temperature' : '4. Set Temperature',
    generate:    mode === 'character' ? '4. Generate Clouds' : '5. Generate Clouds',
  };

  const nextLabel = step === 'generate' ? (importing ? 'Generating…' : 'Generate Clouds ✨') : 'Next →';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}
    >
      <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Upload &amp; Generate Clouds</h2>
            <p className="text-xs text-gray-400 mt-0.5">{STEP_LABELS[step]}</p>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i < stepIndex ? 'bg-accent' :
                  i === stepIndex ? 'bg-accent opacity-100 scale-125' :
                  'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: Files ── */}
          {step === 'files' && (
            <div className="flex flex-col gap-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="text-3xl mb-2">📄</div>
                <p className="text-sm font-medium text-gray-700">Drop files here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">TXT, MD, DOCX, PDF supported</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.docx,.pdf"
                  className="hidden"
                  onChange={e => addFiles(e.target.files)}
                />
              </div>
              {/* File list */}
              {files.length > 0 && (
                <div className="flex flex-col gap-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-gray-700 truncate">{f.name}</span>
                      <button
                        onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-400 ml-2 text-xs"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step: Mode ── */}
          {step === 'mode' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">
                How should the AI approach your material?
              </p>
              <button
                onClick={() => setMode('structure')}
                className={`text-left rounded-xl border p-4 transition-all ${
                  mode === 'structure'
                    ? 'border-accent bg-accent/5 shadow-sm'
                    : 'border-border hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="text-2xl mb-1">📖</div>
                <div className="text-sm font-semibold text-gray-800">Story Structure</div>
                <div className="text-xs text-gray-400 mt-1 leading-snug">
                  Extract all six layers faithfully. Choose a narrative framework (Three Act, Hero's Journey, etc.) to organise the arc. Best for plot-driven material.
                </div>
              </button>
              <button
                onClick={() => setMode('character')}
                className={`text-left rounded-xl border p-4 transition-all ${
                  mode === 'character'
                    ? 'border-accent bg-accent/5 shadow-sm'
                    : 'border-border hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="text-2xl mb-1">🔮</div>
                <div className="text-sm font-semibold text-gray-800">Character Transformation</div>
                <div className="text-xs text-gray-400 mt-1 leading-snug">
                  Focus on how characters change. Maps transformation arcs (before → catalyst → resistance → after), contradictions, and key relationships. Arc beats are organised around turning points, not plot events.
                </div>
              </button>
            </div>
          )}

          {/* ── Step 2: Structure ── */}
          {step === 'structure' && (
            <div className="grid grid-cols-3 gap-3">
              {STORY_STRUCTURES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStructure(s)}
                  className={`text-left rounded-xl border p-3 transition-all ${
                    structure.id === s.id
                      ? 'border-accent bg-accent/5 shadow-sm'
                      : 'border-border hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className="text-sm font-semibold text-gray-800">{s.name}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">{s.description}</div>
                  {s.examples.length > 0 && (
                    <div className="text-[10px] text-accent mt-1 truncate">{s.examples.join(' · ')}</div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Step 3: Temperature ── */}
          {step === 'temperature' && (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-gray-500">
                Controls how much the AI expands and suggests beyond your source material. Can be changed anytime in Chat.
              </p>
              {/* Slider */}
              <div className="px-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={temperature}
                  onChange={e => setTemperature(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>0.0 — Strict</span>
                  <span>0.5 — Balanced</span>
                  <span>1.0 — Creative</span>
                </div>
              </div>
              {/* Presets */}
              <div className="flex flex-col gap-2">
                {TEMP_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setTemperature(p.value)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      temperature === p.value
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      temperature === p.value ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{p.value.toFixed(1)}</div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{p.label}</div>
                      <div className="text-xs text-gray-400">{p.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              {/* Custom value indicator */}
              {!TEMP_PRESETS.find(p => p.value === temperature) && (
                <div className="text-xs text-center text-gray-400">Custom: {temperature.toFixed(1)}</div>
              )}
            </div>
          )}

          {/* ── Step: Summary / Generate ── */}
          {step === 'generate' && (
            <div className="flex flex-col gap-5">
              <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
                <Row label="Files" value={files.map(f => f.name).join(', ')} />
                <Row label="Mode" value={mode === 'character' ? '🔮 Character Transformation' : '📖 Story Structure'} />
                {mode === 'structure' && (
                  <Row label="Structure" value={`${structure.icon} ${structure.name} — ${structure.description}`} />
                )}
                <Row label="Temperature" value={`${temperature.toFixed(1)} — ${TEMP_PRESETS.find(p => p.value === temperature)?.label ?? 'Custom'}`} />
              </div>
              {mode === 'structure' && structure.beats.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Pre-seeded arc beats</p>
                  <div className="flex flex-wrap gap-1.5">
                    {structure.beats.map((b, i) => (
                      <span key={i} className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">{b}</span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-sm text-gray-500">
                {mode === 'character'
                  ? `The AI will map how your characters transform — arcs, contradictions, turning points — at temperature ${temperature.toFixed(1)}.`
                  : `The AI will extract all items from your files, organize the arc using the chosen structure, and build your cloud at temperature ${temperature.toFixed(1)}.`
                }
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={stepIndex === 0 ? onClose : back}
            disabled={importing}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            {stepIndex === 0 ? 'Cancel' : '← Back'}
          </button>
          <button
            onClick={next}
            disabled={!canAdvance || importing}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-medium text-gray-400 w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-700">{value}</span>
    </div>
  );
}
