'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ATOMIC_STATES,
  PRESET_FORMULAS,
  type StateFormula,
  deriveFormulaColor,
  loadStateLibrary,
  saveToStateLibrary,
  deleteFromStateLibrary,
  ATOMIC_STATE_MAP,
  STATE_COLORS,
} from './nodeTypes';

interface StatePanelProps {
  nodeId: string;
  stateColor?: string;
  stateFormula?: StateFormula | null;
  onColorChange: (hex: string) => void;
  onFormulaChange: (formula: StateFormula | null) => void;
}

type Tab = 'color' | 'formula' | 'library';

export default function StatePanel({ nodeId, stateColor, stateFormula, onColorChange, onFormulaChange }: StatePanelProps) {
  const [tab, setTab] = useState<Tab>('formula');
  const [library, setLibrary] = useState<StateFormula[]>([]);

  // Formula builder state
  const [fbBase, setFbBase] = useState<string[]>(stateFormula?.base || []);
  const [fbModifier, setFbModifier] = useState<string>(stateFormula?.modifier || '');
  const [fbName, setFbName] = useState<string>(stateFormula?.name || '');
  const [fbDesc, setFbDesc] = useState<string>(stateFormula?.description || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLibrary(loadStateLibrary());
  }, []);

  // Sync from external formula change
  useEffect(() => {
    if (stateFormula) {
      setFbBase(stateFormula.base);
      setFbModifier(stateFormula.modifier || '');
      setFbName(stateFormula.name);
      setFbDesc(stateFormula.description || '');
    }
  }, [stateFormula]);

  const toggleBase = useCallback((id: string) => {
    setFbBase(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const toggleModifier = useCallback((id: string) => {
    setFbModifier(prev => prev === id ? '' : id);
  }, []);

  const previewFormula: StateFormula = {
    id: `custom-${Date.now()}`,
    name: fbName || 'Unnamed State',
    base: fbBase,
    modifier: fbModifier || undefined,
    description: fbDesc || undefined,
  };

  const previewColor = deriveFormulaColor(previewFormula);

  const applyFormula = useCallback((formula: StateFormula) => {
    onFormulaChange(formula);
    onColorChange(deriveFormulaColor(formula));
    setFbBase(formula.base);
    setFbModifier(formula.modifier || '');
    setFbName(formula.name);
    setFbDesc(formula.description || '');
  }, [onFormulaChange, onColorChange]);

  const handleSaveToLibrary = useCallback(() => {
    if (!fbName.trim() || fbBase.length === 0) return;
    setSaving(true);
    const formula: StateFormula = {
      ...previewFormula,
      id: `custom-${Date.now()}`,
      name: fbName.trim(),
    };
    const updated = saveToStateLibrary(formula);
    setLibrary(updated);
    applyFormula(formula);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [fbName, fbBase, fbModifier, fbDesc, previewFormula, applyFormula]);

  const handleApplyToNode = useCallback(() => {
    if (fbBase.length === 0) return;
    applyFormula(previewFormula);
  }, [fbBase, previewFormula, applyFormula]);

  const handleDeleteFromLibrary = useCallback((id: string) => {
    const updated = deleteFromStateLibrary(id);
    setLibrary(updated);
  }, []);

  const renderFormula = (f: StateFormula) => (
    <span className="text-xs text-gray-400 font-mono">
      ({f.base.map(id => ATOMIC_STATE_MAP[id]?.label || id).join(' + ')})
      {f.modifier ? <span className="text-gray-500"> × {ATOMIC_STATE_MAP[f.modifier]?.label || f.modifier}</span> : null}
    </span>
  );

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {(['formula', 'library', 'color'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs py-1 rounded-md transition-colors capitalize ${
              tab === t ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'formula' ? '⚗️ Formula' : t === 'library' ? '📚 Library' : '🎨 Color'}
          </button>
        ))}
      </div>

      {/* ── COLOR TAB ── */}
      {tab === 'color' && (
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Emotional Color</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(STATE_COLORS).map(([key, { hex, label: colorLabel }]) => (
              <button
                key={key}
                onClick={() => onColorChange(hex)}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 transition-colors"
                style={{ border: stateColor === hex ? '2px solid white' : '1px solid #555' }}
              >
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: hex, display: 'inline-block', flexShrink: 0 }} />
                <span className="text-[10px] text-gray-300">{colorLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── FORMULA TAB ── */}
      {tab === 'formula' && (
        <div className="space-y-3">
          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">State Name</label>
            <input
              value={fbName}
              onChange={e => setFbName(e.target.value)}
              placeholder="e.g. Jane's Activation State..."
              className="w-full bg-gray-800 text-white text-sm rounded px-3 py-2 placeholder-gray-600 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Base states */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
              Base States <span className="text-gray-600 normal-case">(select multiple)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ATOMIC_STATES.map(state => {
                const selected = fbBase.includes(state.id);
                return (
                  <button
                    key={state.id}
                    onClick={() => toggleBase(state.id)}
                    title={state.description}
                    className={`px-2 py-0.5 rounded-full text-xs transition-all ${
                      selected
                        ? 'text-white font-medium shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700'
                    }`}
                    style={selected ? { background: state.color, border: `1px solid ${state.color}` } : undefined}
                  >
                    {state.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modifier */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
              Modifier × <span className="text-gray-600 normal-case">(optional — amplifies/transforms base)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ATOMIC_STATES.map(state => {
                const selected = fbModifier === state.id;
                return (
                  <button
                    key={state.id}
                    onClick={() => toggleModifier(state.id)}
                    title={state.description}
                    className={`px-2 py-0.5 rounded-full text-xs transition-all ${
                      selected
                        ? 'text-white font-medium shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700'
                    }`}
                    style={selected ? { background: state.color, border: `1px solid ${state.color}` } : undefined}
                  >
                    {state.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Description</label>
            <textarea
              value={fbDesc}
              onChange={e => setFbDesc(e.target.value)}
              placeholder="What does this state feel like from inside? When does it appear?"
              rows={2}
              className="w-full bg-gray-800 text-gray-300 text-xs rounded px-3 py-2 placeholder-gray-600 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </div>

          {/* Preview + Actions */}
          {fbBase.length > 0 && (
            <div
              className="rounded-lg p-3 border"
              style={{ borderColor: previewColor, background: `${previewColor}18` }}
            >
              <div className="text-xs font-semibold text-white mb-1">
                {fbName || 'Unnamed State'}
              </div>
              <div className="text-xs text-gray-400 font-mono mb-2">
                ({fbBase.map(id => ATOMIC_STATE_MAP[id]?.label || id).join(' + ')})
                {fbModifier && <span className="text-gray-500"> × {ATOMIC_STATE_MAP[fbModifier]?.label || fbModifier}</span>}
              </div>
              {fbDesc && <div className="text-xs text-gray-500 italic">{fbDesc}</div>}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleApplyToNode}
              disabled={fbBase.length === 0}
              className="flex-1 py-1.5 bg-blue-800/60 hover:bg-blue-700/70 border border-blue-700/50 rounded text-blue-200 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply to Node
            </button>
            <button
              onClick={handleSaveToLibrary}
              disabled={!fbName.trim() || fbBase.length === 0 || saving}
              className="flex-1 py-1.5 bg-emerald-800/60 hover:bg-emerald-700/70 border border-emerald-700/50 rounded text-emerald-200 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saved ? '✓ Saved!' : 'Save to Library'}
            </button>
          </div>
        </div>
      )}

      {/* ── LIBRARY TAB ── */}
      {tab === 'library' && (
        <div className="space-y-3">
          {/* Presets */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Preset Formulas</label>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {PRESET_FORMULAS.map(f => (
                <button
                  key={f.id}
                  onClick={() => { applyFormula(f); setTab('formula'); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-colors group"
                  style={{ borderLeft: `3px solid ${f.color || '#888'}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white group-hover:text-white">{f.name}</span>
                    <span className="text-[10px] text-gray-600 group-hover:text-gray-400">use →</span>
                  </div>
                  <div className="mt-0.5">{renderFormula(f)}</div>
                  {f.description && (
                    <div className="text-[10px] text-gray-600 mt-0.5 leading-tight line-clamp-2">{f.description}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* User library */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
              My Library {library.length > 0 && <span className="text-gray-600">({library.length})</span>}
            </label>
            {library.length === 0 ? (
              <p className="text-xs text-gray-600 italic px-1">
                No saved formulas yet. Build one in the Formula tab and save it here.
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {library.map(f => {
                  const col = deriveFormulaColor(f);
                  return (
                    <div
                      key={f.id}
                      className="flex items-stretch gap-1"
                    >
                      <button
                        onClick={() => { applyFormula(f); setTab('formula'); }}
                        className="flex-1 text-left px-3 py-2 rounded-l-lg hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-colors group"
                        style={{ borderLeft: `3px solid ${col}` }}
                      >
                        <div className="text-xs font-medium text-white">{f.name}</div>
                        <div className="mt-0.5">{renderFormula(f)}</div>
                        {f.description && (
                          <div className="text-[10px] text-gray-600 mt-0.5 line-clamp-1">{f.description}</div>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteFromLibrary(f.id)}
                        className="px-2 rounded-r-lg border border-gray-700 border-l-0 text-gray-600 hover:text-red-400 hover:border-red-800 text-xs transition-colors"
                        title="Delete from library"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
