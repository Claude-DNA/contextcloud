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

type Tab = 'formula' | 'library' | 'color';
type Sign = 1 | -1;

export default function StatePanel({
  stateColor, stateFormula, onColorChange, onFormulaChange, theme = 'dark',
}: StatePanelProps) {
  const L = theme === 'light';

  const [tab, setTab] = useState<Tab>('formula');
  const [library, setLibrary] = useState<StateFormula[]>([]);
  // base: Map of id → sign (1 or -1). Absent = not selected.
  const [baseMap, setBaseMap] = useState<Record<string, Sign>>({});
  const [modifier, setModifier] = useState<string>('');
  const [modSign, setModSign] = useState<Sign>(1);
  const [fbName, setFbName] = useState<string>('');
  const [fbDesc, setFbDesc] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');

  useEffect(() => { setLibrary(loadStateLibrary()); }, []);

  // Sync from incoming formula
  useEffect(() => {
    if (stateFormula) {
      const map: Record<string, Sign> = {};
      stateFormula.base.forEach(id => {
        map[id] = stateFormula.signs?.[id] ?? 1;
      });
      setBaseMap(map);
      setModifier(stateFormula.modifier || '');
      setModSign(stateFormula.modifierSign ?? 1);
      setFbName(stateFormula.name);
      setFbDesc(stateFormula.description || '');
    }
  }, [stateFormula]);

  // Cycle: unselected → + → − → unselected
  const cycleBase = useCallback((id: string) => {
    setBaseMap(prev => {
      if (!(id in prev)) return { ...prev, [id]: 1 };      // add as +
      if (prev[id] === 1) return { ...prev, [id]: -1 };    // flip to −
      const next = { ...prev };
      delete next[id];                                       // remove
      return next;
    });
  }, []);

  // Modifier: click same to cycle sign, click different to switch
  const handleModifier = useCallback((id: string) => {
    if (modifier === id) {
      if (modSign === 1) setModSign(-1);
      else { setModifier(''); setModSign(1); }
    } else {
      setModifier(id);
      setModSign(1);
    }
  }, [modifier, modSign]);

  const baseIds = Object.keys(baseMap);
  const signs = baseMap;

  const buildFormula = useCallback((): StateFormula => ({
    id: `custom-${Date.now()}`,
    name: fbName.trim() || 'Unnamed State',
    base: baseIds,
    signs: Object.values(baseMap).some(v => v === -1) ? baseMap : undefined,
    modifier: modifier || undefined,
    modifierSign: modifier && modSign === -1 ? -1 : undefined,
    description: fbDesc.trim() || undefined,
  }), [fbName, baseIds, baseMap, modifier, modSign, fbDesc]);

  const applyFormula = useCallback((formula: StateFormula) => {
    onFormulaChange(formula);
    onColorChange(deriveFormulaColor(formula));
    const map: Record<string, Sign> = {};
    formula.base.forEach(id => { map[id] = formula.signs?.[id] ?? 1; });
    setBaseMap(map);
    setModifier(formula.modifier || '');
    setModSign(formula.modifierSign ?? 1);
    setFbName(formula.name);
    setFbDesc(formula.description || '');
  }, [onFormulaChange, onColorChange]);

  const handleApply = useCallback(() => {
    if (baseIds.length === 0) return;
    applyFormula(buildFormula());
  }, [baseIds, buildFormula, applyFormula]);

  const handleSave = useCallback(() => {
    if (!fbName.trim() || baseIds.length === 0) return;
    const formula = buildFormula();
    setLibrary(saveToStateLibrary(formula));
    applyFormula(formula);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [fbName, baseIds, buildFormula, applyFormula]);

  // Format formula as readable string
  const fmtF = (f: StateFormula) => {
    const baseParts = f.base.map(id => {
      const sign = f.signs?.[id] ?? 1;
      const label = ATOMIC_STATE_MAP[id]?.label || id;
      return sign === -1 ? `−${label}` : label;
    });
    const base = `(${baseParts.join(' + ')})`;
    if (!f.modifier) return base;
    const mLabel = ATOMIC_STATE_MAP[f.modifier]?.label || f.modifier;
    const mSign = f.modifierSign === -1 ? '−' : '';
    return `${base} × ${mSign}${mLabel}`;
  };

  // Live preview formula string
  const previewStr = baseIds.length > 0
    ? fmtF({ id: '', name: '', base: baseIds, signs: Object.values(baseMap).some(v => v === -1) ? baseMap : undefined, modifier: modifier || undefined, modifierSign: modifier && modSign === -1 ? -1 : undefined })
    : null;

  const previewColor = baseIds.length > 0 ? deriveFormulaColor({ id: '', name: '', base: baseIds, modifier: modifier || undefined }) : '#888';

  // Style tokens
  const bg = L ? '#fff' : '#1f2937';
  const bgSub = L ? '#f9fafb' : '#111827';
  const bdr = L ? '#e5e7eb' : '#374151';
  const txt = L ? '#111827' : '#f9fafb';
  const muted = L ? '#6b7280' : '#9ca3af';
  const tabBg = L ? '#f3f4f6' : '#1f2937';
  const tabActiveBg = L ? '#fff' : '#374151';
  const tabActiveBdr = L ? '#d1d5db' : '#4b5563';

  return (
    <div style={{ fontFamily: 'inherit' }}>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: tabBg, borderRadius: 8, padding: 4, border: `1px solid ${bdr}`, marginBottom: 12 }}>
        {(['formula', 'library', 'color'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 6, cursor: 'pointer',
            fontWeight: tab === t ? 600 : 400,
            background: tab === t ? tabActiveBg : 'transparent',
            color: tab === t ? txt : muted,
            border: tab === t ? `1px solid ${tabActiveBdr}` : '1px solid transparent',
            transition: 'all 0.15s',
          }}>
            {t === 'formula' ? '⚗️ Formula' : t === 'library' ? '📚 Library' : '🎨 Color'}
          </button>
        ))}
      </div>

      {/* ── FORMULA TAB ── */}
      {tab === 'formula' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Live formula preview */}
          {previewStr && (
            <div style={{ borderRadius: 8, padding: '6px 10px', border: `1px solid ${previewColor}`, background: `${previewColor}15`, fontSize: 12, fontFamily: 'monospace', color: txt }}>
              <span style={{ color: muted, fontSize: 10 }}>formula: </span>{previewStr}
            </div>
          )}

          {/* Name */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>State Name</div>
            <input
              value={fbName}
              onChange={e => setFbName(e.target.value)}
              placeholder="e.g. Honor, Despair, Warrior's Resolve..."
              style={{ width: '100%', background: bgSub, color: txt, fontSize: 13, borderRadius: 6, padding: '6px 10px', border: `1px solid ${bdr}`, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Base states */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 1 }}>Base States</div>
              <div style={{ fontSize: 10, color: muted }}>1st click: add · 2nd: negative · 3rd: remove</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {ATOMIC_STATES.map(state => {
                const inMap = state.id in baseMap;
                const neg = baseMap[state.id] === -1;
                return (
                  <button
                    key={state.id}
                    onClick={() => cycleBase(state.id)}
                    title={state.description}
                    style={{
                      padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', transition: 'all 0.1s',
                      background: !inMap ? bgSub : neg ? '#7f1d1d' : state.color,
                      color: inMap ? '#fff' : muted,
                      border: !inMap ? `1px solid ${bdr}` : neg ? '1px solid #dc2626' : `1px solid ${state.color}`,
                      fontWeight: inMap ? 600 : 400,
                      textDecoration: neg ? 'line-through' : 'none',
                      position: 'relative',
                    }}
                  >
                    {neg && <span style={{ marginRight: 2, textDecoration: 'none' }}>−</span>}{state.label}
                    {inMap && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>{neg ? '−' : '+'}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modifier */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 1 }}>Modifier ×</div>
              <div style={{ fontSize: 10, color: muted }}>1st click: add · 2nd: negative · 3rd: remove</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {ATOMIC_STATES.map(state => {
                const sel = modifier === state.id;
                const neg = sel && modSign === -1;
                return (
                  <button
                    key={state.id}
                    onClick={() => handleModifier(state.id)}
                    title={state.description}
                    style={{
                      padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', transition: 'all 0.1s',
                      background: !sel ? bgSub : neg ? '#7f1d1d' : state.color,
                      color: sel ? '#fff' : muted,
                      border: !sel ? `1px solid ${bdr}` : neg ? '1px solid #dc2626' : `1px solid ${state.color}`,
                      fontWeight: sel ? 600 : 400,
                    }}
                  >
                    {neg && <span style={{ marginRight: 2 }}>−</span>}{state.label}
                    {sel && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>{neg ? '−' : '+'}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Description</div>
            <textarea
              value={fbDesc}
              onChange={e => setFbDesc(e.target.value)}
              placeholder="What does this state feel like from inside?"
              rows={2}
              style={{ width: '100%', background: bgSub, color: txt, fontSize: 11, borderRadius: 6, padding: '6px 10px', border: `1px solid ${bdr}`, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {/* Clear + Actions */}
          <div style={{ display: 'flex', gap: 6 }}>
            {baseIds.length > 0 && (
              <button
                onClick={() => { setBaseMap({}); setModifier(''); setModSign(1); }}
                style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer', background: bgSub, color: muted, border: `1px solid ${bdr}` }}
              >Clear</button>
            )}
            <button
              onClick={handleApply}
              disabled={baseIds.length === 0}
              style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: baseIds.length === 0 ? 'not-allowed' : 'pointer', opacity: baseIds.length === 0 ? 0.4 : 1, background: L ? '#eff6ff' : '#1e3a5f', color: L ? '#1d4ed8' : '#93c5fd', border: L ? '1px solid #bfdbfe' : '1px solid #1e40af' }}
            >Apply to Node</button>
            <button
              onClick={handleSave}
              disabled={!fbName.trim() || baseIds.length === 0}
              style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: (!fbName.trim() || baseIds.length === 0) ? 'not-allowed' : 'pointer', opacity: (!fbName.trim() || baseIds.length === 0) ? 0.4 : 1, background: L ? '#f0fdf4' : '#14532d', color: L ? '#15803d' : '#86efac', border: L ? '1px solid #bbf7d0' : '1px solid #166534' }}
            >{saved ? '✓ Saved!' : 'Save to Library'}</button>
          </div>
        </div>
      )}

      {/* ── LIBRARY TAB ── */}
      {tab === 'library' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: muted, pointerEvents: 'none' }}>🔍</span>
            <input
              value={librarySearch}
              onChange={e => setLibrarySearch(e.target.value)}
              placeholder="Search formulas..."
              style={{ width: '100%', background: bgSub, color: txt, fontSize: 12, borderRadius: 6, padding: '5px 10px 5px 28px', border: `1px solid ${bdr}`, outline: 'none', boxSizing: 'border-box' }}
            />
            {librarySearch && (
              <button
                onClick={() => setLibrarySearch('')}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: muted, fontSize: 14, lineHeight: 1, padding: 0 }}
              >×</button>
            )}
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Preset Formulas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 240, overflowY: 'auto' }}>
              {PRESET_FORMULAS.filter(f => {
                const q = librarySearch.toLowerCase();
                return !q || f.name.toLowerCase().includes(q) || fmtF(f).toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q);
              }).map(f => (
                <button
                  key={f.id}
                  onClick={() => { applyFormula(f); setTab('formula'); }}
                  title={f.description}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', background: bgSub, border: `1px solid ${bdr}`, borderLeft: `3px solid ${f.color || '#888'}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = L ? '#f3f4f6' : '#374151')}
                  onMouseLeave={e => (e.currentTarget.style.background = bgSub)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: txt, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: muted, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtF(f)}</div>
                  </div>
                  <span style={{ fontSize: 10, color: muted, flexShrink: 0 }}>→</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              My Library {library.length > 0 && <span style={{ opacity: 0.6 }}>({library.length})</span>}
            </div>
            {library.length === 0 ? (
              <div style={{ fontSize: 11, color: muted, fontStyle: 'italic', padding: '4px 2px' }}>No saved formulas yet — build one in the Formula tab.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
                {library.filter(f => {
                  const q = librarySearch.toLowerCase();
                  return !q || f.name.toLowerCase().includes(q) || fmtF(f).toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q);
                }).map(f => {
                  const col = deriveFormulaColor(f);
                  return (
                    <div key={f.id} style={{ display: 'flex', gap: 1 }}>
                      <button
                        onClick={() => { applyFormula(f); setTab('formula'); }}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: '6px 0 0 6px', cursor: 'pointer', textAlign: 'left', background: bgSub, border: `1px solid ${bdr}`, borderLeft: `3px solid ${col}`, borderRight: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.background = L ? '#f3f4f6' : '#374151')}
                        onMouseLeave={e => (e.currentTarget.style.background = bgSub)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: txt }}>{f.name}</div>
                          <div style={{ fontSize: 10, color: muted, fontFamily: 'monospace' }}>{fmtF(f)}</div>
                        </div>
                        <span style={{ fontSize: 10, color: muted }}>→</span>
                      </button>
                      <button
                        onClick={() => setLibrary(deleteFromStateLibrary(f.id))}
                        style={{ padding: '0 8px', borderRadius: '0 6px 6px 0', cursor: 'pointer', background: bgSub, border: `1px solid ${bdr}`, color: muted, fontSize: 14 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = muted; }}
                        title="Delete"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COLOR TAB ── */}
      {tab === 'color' && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Emotional Color</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {Object.entries(STATE_COLORS).map(([key, { hex, label: colorLabel }]) => (
              <button
                key={key}
                onClick={() => onColorChange(hex)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: bgSub, border: stateColor === hex ? `2px solid ${hex}` : `1px solid ${bdr}` }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: hex, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: muted }}>{colorLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
