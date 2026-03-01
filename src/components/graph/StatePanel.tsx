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
  theme?: 'dark' | 'light';
}

type Tab = 'color' | 'formula' | 'library';

export default function StatePanel({ nodeId, stateColor, stateFormula, onColorChange, onFormulaChange, theme = 'dark' }: StatePanelProps) {
  const light = theme === 'light';

  // Theme-aware class helpers
  const T = {
    tabBar:      light ? 'flex gap-1 bg-gray-100 rounded-lg p-1 border border-gray-200' : 'flex gap-1 bg-gray-800 rounded-lg p-1',
    tabActive:   light ? 'flex-1 text-xs py-1 rounded-md bg-white text-gray-800 font-medium shadow-sm border border-gray-200' : 'flex-1 text-xs py-1 rounded-md bg-gray-600 text-white',
    tabInactive: light ? 'flex-1 text-xs py-1 rounded-md text-gray-500 hover:text-gray-700' : 'flex-1 text-xs py-1 rounded-md text-gray-400 hover:text-gray-200',
    label:       light ? 'text-xs text-gray-500 uppercase tracking-wider mb-1 block font-medium' : 'text-xs text-gray-500 uppercase tracking-wider mb-1 block',
    input:       light ? 'w-full bg-white text-gray-800 text-sm rounded-lg px-3 py-2 placeholder-gray-400 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300' : 'w-full bg-gray-800 text-white text-sm rounded px-3 py-2 placeholder-gray-600 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500',
    textarea:    light ? 'w-full bg-white text-gray-700 text-xs rounded-lg px-3 py-2 placeholder-gray-400 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y' : 'w-full bg-gray-800 text-gray-300 text-xs rounded px-3 py-2 placeholder-gray-600 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y',
    pillBase:    light ? 'px-2 py-1 rounded-full text-xs border transition-all cursor-pointer' : 'px-2 py-0.5 rounded-full text-xs transition-all',
    pillOff:     light ? 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800' : 'text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700',
    previewBox:  light ? 'rounded-lg p-3 border' : 'rounded-lg p-3 border',
    previewName: light ? 'text-xs font-semibold text-gray-800 mb-1' : 'text-xs font-semibold text-white mb-1',
    previewFormula: light ? 'text-xs text-gray-500 font-mono mb-1' : 'text-xs text-gray-400 font-mono mb-2',
    previewDesc: light ? 'text-xs text-gray-400 italic' : 'text-xs text-gray-500 italic',
    btnApply:    light ? 'flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-700 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors' : 'flex-1 py-1.5 bg-blue-800/60 hover:bg-blue-700/70 border border-blue-700/50 rounded text-blue-200 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
    btnSave:     light ? 'flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors' : 'flex-1 py-1.5 bg-emerald-800/60 hover:bg-emerald-700/70 border border-emerald-700/50 rounded text-emerald-200 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
    libSection:  light ? 'text-xs text-gray-500 uppercase tracking-wider mb-2 block font-medium' : 'text-xs text-gray-500 uppercase tracking-wider mb-2 block',
    libCard:     light ? 'w-full text-left px-3 py-2 rounded-l-lg hover:bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors group' : 'w-full text-left px-3 py-2 rounded-l-lg hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-colors group',
    libTitle:    light ? 'text-xs font-medium text-gray-800' : 'text-xs font-medium text-white',
    libFormula:  light ? 'text-xs text-gray-400 font-mono' : 'text-xs text-gray-400 font-mono',
    libDesc:     light ? 'text-[10px] text-gray-400 mt-0.5 line-clamp-1' : 'text-[10px] text-gray-600 mt-0.5 line-clamp-1',
    libDel:      light ? 'px-2 rounded-r-lg border border-gray-200 border-l-0 text-gray-300 hover:text-red-500 hover:border-red-200 text-xs transition-colors' : 'px-2 rounded-r-lg border border-gray-700 border-l-0 text-gray-600 hover:text-red-400 hover:border-red-800 text-xs transition-colors',
    libEmpty:    light ? 'text-xs text-gray-400 italic px-1' : 'text-xs text-gray-600 italic px-1',
    colorBtn:    light ? 'flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors' : 'flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 transition-colors',
    colorLabel:  light ? 'text-[11px] text-gray-600' : 'text-[10px] text-gray-300',
    colorGrid:   light ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-3 gap-2',
  };

  const [tab, setTab] = useState<Tab>('formula');
  const [library, setLibrary] = useState<StateFormula[]>([]);

  const [fbBase, setFbBase] = useState<string[]>(stateFormula?.base || []);
  const [fbModifier, setFbModifier] = useState<string>(stateFormula?.modifier || '');
  const [fbName, setFbName] = useState<string>(stateFormula?.name || '');
  const [fbDesc, setFbDesc] = useState<string>(stateFormula?.description || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLibrary(loadStateLibrary()); }, []);

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
    setLibrary(deleteFromStateLibrary(id));
  }, []);

  const renderFormula = (f: StateFormula) => (
    <span className={T.libFormula}>
      ({f.base.map(id => ATOMIC_STATE_MAP[id]?.label || id).join(' + ')})
      {f.modifier ? <span style={{ opacity: 0.7 }}> × {ATOMIC_STATE_MAP[f.modifier]?.label || f.modifier}</span> : null}
    </span>
  );

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className={T.tabBar}>
        {(['formula', 'library', 'color'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`${tab === t ? T.tabActive : T.tabInactive} capitalize transition-colors`}
          >
            {t === 'formula' ? '⚗️ Formula' : t === 'library' ? '📚 Library' : '🎨 Color'}
          </button>
        ))}
      </div>

      {/* ── COLOR TAB ── */}
      {tab === 'color' && (
        <div>
          <label className={T.label}>Emotional Color</label>
          <div className={T.colorGrid}>
            {Object.entries(STATE_COLORS).map(([key, { hex, label: colorLabel }]) => (
              <button
                key={key}
                onClick={() => onColorChange(hex)}
                className={T.colorBtn}
                style={{ border: stateColor === hex ? `2px solid ${hex}` : light ? '1px solid #e5e7eb' : '1px solid #555' }}
              >
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: hex, display: 'inline-block', flexShrink: 0 }} />
                <span className={T.colorLabel}>{colorLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── FORMULA TAB ── */}
      {tab === 'formula' && (
        <div className="space-y-3">
          <div>
            <label className={T.label}>State Name</label>
            <input
              value={fbName}
              onChange={e => setFbName(e.target.value)}
              placeholder="e.g. Jane's Activation State..."
              className={T.input}
            />
          </div>

          <div>
            <label className={T.label}>
              Base States <span style={{ opacity: 0.6, fontWeight: 400, textTransform: 'none' }}>(select multiple)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ATOMIC_STATES.map(state => {
                const selected = fbBase.includes(state.id);
                return (
                  <button
                    key={state.id}
                    onClick={() => toggleBase(state.id)}
                    title={state.description}
                    className={`${T.pillBase} ${selected ? '' : T.pillOff}`}
                    style={selected ? { background: state.color, border: `1px solid ${state.color}`, color: 'white', fontWeight: 500 } : undefined}
                  >
                    {state.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={T.label}>
              Modifier × <span style={{ opacity: 0.6, fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ATOMIC_STATES.map(state => {
                const selected = fbModifier === state.id;
                return (
                  <button
                    key={state.id}
                    onClick={() => toggleModifier(state.id)}
                    title={state.description}
                    className={`${T.pillBase} ${selected ? '' : T.pillOff}`}
                    style={selected ? { background: state.color, border: `1px solid ${state.color}`, color: 'white', fontWeight: 500 } : undefined}
                  >
                    {state.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={T.label}>Description</label>
            <textarea
              value={fbDesc}
              onChange={e => setFbDesc(e.target.value)}
              placeholder="What does this state feel like from inside? When does it appear?"
              rows={2}
              className={T.textarea}
            />
          </div>

          {fbBase.length > 0 && (
            <div
              className={T.previewBox}
              style={{ borderColor: previewColor, background: `${previewColor}18` }}
            >
              <div className={T.previewName}>{fbName || 'Unnamed State'}</div>
              <div className={T.previewFormula}>
                ({fbBase.map(id => ATOMIC_STATE_MAP[id]?.label || id).join(' + ')})
                {fbModifier && <span style={{ opacity: 0.7 }}> × {ATOMIC_STATE_MAP[fbModifier]?.label || fbModifier}</span>}
              </div>
              {fbDesc && <div className={T.previewDesc}>{fbDesc}</div>}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleApplyToNode} disabled={fbBase.length === 0} className={T.btnApply}>
              Apply to Node
            </button>
            <button onClick={handleSaveToLibrary} disabled={!fbName.trim() || fbBase.length === 0 || saving} className={T.btnSave}>
              {saved ? '✓ Saved!' : 'Save to Library'}
            </button>
          </div>
        </div>
      )}

      {/* ── LIBRARY TAB ── */}
      {tab === 'library' && (
        <div className="space-y-3">
          <div>
            <label className={T.libSection}>Preset Formulas</label>
            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
              {PRESET_FORMULAS.map(f => (
                <button
                  key={f.id}
                  onClick={() => { applyFormula(f); setTab('formula'); }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors group ${light ? 'hover:bg-gray-50 border border-gray-200 hover:border-gray-300' : 'hover:bg-gray-700 border border-gray-700 hover:border-gray-500'}`}
                  style={{ borderLeft: `3px solid ${f.color || '#888'}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className={T.libTitle}>{f.name}</span>
                    <span className={light ? 'text-[10px] text-gray-300 group-hover:text-gray-500' : 'text-[10px] text-gray-600 group-hover:text-gray-400'}>use →</span>
                  </div>
                  <div className="mt-0.5">{renderFormula(f)}</div>
                  {f.description && <div className={T.libDesc}>{f.description}</div>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={T.libSection}>
              My Library {library.length > 0 && <span style={{ opacity: 0.6 }}>({library.length})</span>}
            </label>
            {library.length === 0 ? (
              <p className={T.libEmpty}>No saved formulas yet. Build one in the Formula tab and save it here.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {library.map(f => {
                  const col = deriveFormulaColor(f);
                  return (
                    <div key={f.id} className="flex items-stretch gap-1">
                      <button
                        onClick={() => { applyFormula(f); setTab('formula'); }}
                        className={T.libCard}
                        style={{ borderLeft: `3px solid ${col}` }}
                      >
                        <div className={T.libTitle}>{f.name}</div>
                        <div className="mt-0.5">{renderFormula(f)}</div>
                        {f.description && <div className={T.libDesc}>{f.description}</div>}
                      </button>
                      <button
                        onClick={() => handleDeleteFromLibrary(f.id)}
                        className={T.libDel}
                        title="Delete from library"
                      >×</button>
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
