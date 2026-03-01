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

export default function StatePanel({
  stateColor, stateFormula, onColorChange, onFormulaChange, theme = 'dark',
}: StatePanelProps) {
  const L = theme === 'light';

  const [tab, setTab] = useState<Tab>('formula');
  const [library, setLibrary] = useState<StateFormula[]>([]);
  const [fbBase, setFbBase] = useState<string[]>(stateFormula?.base || []);
  const [fbModifier, setFbModifier] = useState<string>(stateFormula?.modifier || '');
  const [fbName, setFbName] = useState<string>(stateFormula?.name || '');
  const [fbDesc, setFbDesc] = useState<string>(stateFormula?.description || '');
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

  const applyFormula = useCallback((formula: StateFormula) => {
    onFormulaChange(formula);
    onColorChange(deriveFormulaColor(formula));
    setFbBase(formula.base);
    setFbModifier(formula.modifier || '');
    setFbName(formula.name);
    setFbDesc(formula.description || '');
  }, [onFormulaChange, onColorChange]);

  const handleSave = useCallback(() => {
    if (!fbName.trim() || fbBase.length === 0) return;
    const formula: StateFormula = {
      id: `custom-${Date.now()}`,
      name: fbName.trim(),
      base: fbBase,
      modifier: fbModifier || undefined,
      description: fbDesc || undefined,
    };
    setLibrary(saveToStateLibrary(formula));
    applyFormula(formula);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [fbName, fbBase, fbModifier, fbDesc, applyFormula]);

  const previewColor = deriveFormulaColor({ id: '', name: '', base: fbBase, modifier: fbModifier || undefined });

  // Compact formula string
  const fmtFormula = (f: StateFormula) =>
    `(${f.base.map(id => ATOMIC_STATE_MAP[id]?.label || id).join(' + ')})${f.modifier ? ' × ' + (ATOMIC_STATE_MAP[f.modifier]?.label || f.modifier) : ''}`;

  // Style tokens — all inline so Tailwind JIT can't interfere
  const bg = L ? '#ffffff' : '#1f2937';
  const bgSub = L ? '#f9fafb' : '#111827';
  const border = L ? '#e5e7eb' : '#374151';
  const textMain = L ? '#111827' : '#f9fafb';
  const textSub = L ? '#6b7280' : '#9ca3af';
  const tabBg = L ? '#f3f4f6' : '#1f2937';
  const tabActiveBg = L ? '#ffffff' : '#374151';
  const tabActiveBorder = L ? '#d1d5db' : '#4b5563';

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: tabBg, borderRadius: 8, padding: 4, border: `1px solid ${border}`, marginBottom: 12 }}>
        {(['formula', 'library', 'color'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 6, cursor: 'pointer', fontWeight: tab === t ? 600 : 400,
              background: tab === t ? tabActiveBg : 'transparent',
              color: tab === t ? textMain : textSub,
              border: tab === t ? `1px solid ${tabActiveBorder}` : '1px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {t === 'formula' ? '⚗️ Formula' : t === 'library' ? '📚 Library' : '🎨 Color'}
          </button>
        ))}
      </div>

      {/* ── FORMULA TAB ── */}
      {tab === 'formula' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: textSub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>State Name</div>
            <input
              value={fbName}
              onChange={e => setFbName(e.target.value)}
              placeholder="e.g. Jane's Activation State..."
              style={{ width: '100%', background: bgSub, color: textMain, fontSize: 13, borderRadius: 6, padding: '6px 10px', border: `1px solid ${border}`, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: textSub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Base States <span style={{ fontWeight: 400, textTransform: 'none' }}>(select multiple)</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {ATOMIC_STATES.map(state => {
                const sel = fbBase.includes(state.id);
                return (
                  <button
                    key={state.id}
                    onClick={() => setFbBase(p => p.includes(state.id) ? p.filter(x => x !== state.id) : [...p, state.id])}
                    title={state.description}
                    style={{
                      padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', transition: 'all 0.1s',
                      background: sel ? state.color : bgSub,
                      color: sel ? '#fff' : textSub,
                      border: sel ? `1px solid ${state.color}` : `1px solid ${border}`,
                      fontWeight: sel ? 600 : 400,
                    }}
                  >{state.label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: textSub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Modifier × <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {ATOMIC_STATES.map(state => {
                const sel = fbModifier === state.id;
                return (
                  <button
                    key={state.id}
                    onClick={() => setFbModifier(p => p === state.id ? '' : state.id)}
                    title={state.description}
                    style={{
                      padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', transition: 'all 0.1s',
                      background: sel ? state.color : bgSub,
                      color: sel ? '#fff' : textSub,
                      border: sel ? `1px solid ${state.color}` : `1px solid ${border}`,
                      fontWeight: sel ? 600 : 400,
                    }}
                  >{state.label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: textSub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Description</div>
            <textarea
              value={fbDesc}
              onChange={e => setFbDesc(e.target.value)}
              placeholder="What does this state feel like from inside?"
              rows={2}
              style={{ width: '100%', background: bgSub, color: textMain, fontSize: 11, borderRadius: 6, padding: '6px 10px', border: `1px solid ${border}`, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {fbBase.length > 0 && (
            <div style={{ borderRadius: 8, padding: '8px 12px', border: `1px solid ${previewColor}`, background: `${previewColor}18` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: textMain, marginBottom: 2 }}>{fbName || 'Unnamed State'}</div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: textSub }}>{fmtFormula({ id: '', name: '', base: fbBase, modifier: fbModifier || undefined })}</div>
              {fbDesc && <div style={{ fontSize: 11, color: textSub, fontStyle: 'italic', marginTop: 2 }}>{fbDesc}</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => fbBase.length > 0 && applyFormula({ id: `tmp-${Date.now()}`, name: fbName || 'Unnamed', base: fbBase, modifier: fbModifier || undefined, description: fbDesc || undefined })}
              disabled={fbBase.length === 0}
              style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: fbBase.length === 0 ? 'not-allowed' : 'pointer', opacity: fbBase.length === 0 ? 0.4 : 1, background: L ? '#eff6ff' : '#1e3a5f', color: L ? '#1d4ed8' : '#93c5fd', border: L ? '1px solid #bfdbfe' : '1px solid #1e40af' }}
            >Apply to Node</button>
            <button
              onClick={handleSave}
              disabled={!fbName.trim() || fbBase.length === 0}
              style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: (!fbName.trim() || fbBase.length === 0) ? 'not-allowed' : 'pointer', opacity: (!fbName.trim() || fbBase.length === 0) ? 0.4 : 1, background: L ? '#f0fdf4' : '#14532d', color: L ? '#15803d' : '#86efac', border: L ? '1px solid #bbf7d0' : '1px solid #166534' }}
            >{saved ? '✓ Saved!' : 'Save to Library'}</button>
          </div>
        </div>
      )}

      {/* ── LIBRARY TAB ── */}
      {tab === 'library' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: textSub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Preset Formulas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 240, overflowY: 'auto' }}>
              {PRESET_FORMULAS.map(f => (
                <button
                  key={f.id}
                  onClick={() => { applyFormula(f); setTab('formula'); }}
                  title={f.description}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                    background: bgSub, border: `1px solid ${border}`, borderLeft: `3px solid ${f.color || '#888'}`,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = L ? '#f3f4f6' : '#374151')}
                  onMouseLeave={e => (e.currentTarget.style.background = bgSub)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: textSub, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtFormula(f)}</div>
                  </div>
                  <span style={{ fontSize: 10, color: textSub, flexShrink: 0 }}>→</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: textSub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              My Library {library.length > 0 && <span style={{ opacity: 0.6 }}>({library.length})</span>}
            </div>
            {library.length === 0 ? (
              <div style={{ fontSize: 11, color: textSub, fontStyle: 'italic', padding: '4px 2px' }}>
                No saved formulas yet — build one in Formula tab.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
                {library.map(f => {
                  const col = deriveFormulaColor(f);
                  return (
                    <div key={f.id} style={{ display: 'flex', gap: 1 }}>
                      <button
                        onClick={() => { applyFormula(f); setTab('formula'); }}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: '6px 0 0 6px', cursor: 'pointer', textAlign: 'left',
                          background: bgSub, border: `1px solid ${border}`, borderLeft: `3px solid ${col}`, borderRight: 'none',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = L ? '#f3f4f6' : '#374151')}
                        onMouseLeave={e => (e.currentTarget.style.background = bgSub)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                          <div style={{ fontSize: 10, color: textSub, fontFamily: 'monospace' }}>{fmtFormula(f)}</div>
                        </div>
                        <span style={{ fontSize: 10, color: textSub }}>→</span>
                      </button>
                      <button
                        onClick={() => setLibrary(deleteFromStateLibrary(f.id))}
                        style={{ padding: '0 8px', borderRadius: '0 6px 6px 0', cursor: 'pointer', background: bgSub, border: `1px solid ${border}`, color: textSub, fontSize: 14 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = textSub; e.currentTarget.style.borderColor = border; }}
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
          <div style={{ fontSize: 10, fontWeight: 600, color: textSub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Emotional Color</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {Object.entries(STATE_COLORS).map(([key, { hex, label: colorLabel }]) => (
              <button
                key={key}
                onClick={() => onColorChange(hex)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                  background: bgSub, border: stateColor === hex ? `2px solid ${hex}` : `1px solid ${border}`,
                  transition: 'border 0.1s',
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: hex, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: textSub }}>{colorLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
