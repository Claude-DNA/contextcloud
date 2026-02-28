'use client';

import React, { useState, useCallback } from 'react';
import { NARRATIVE_AXES, AXIS_LABELS, NarrativeAxis, NarrativeVector } from '@/lib/narrative-vectors';

interface IdeaWithVector {
  id: string;
  text: string;
  weight: number;
  vector?: NarrativeVector;
  vectorizing?: boolean;
  vectorized?: boolean;
}

interface ResonancePair {
  elementA: { id: string; label: string; type: string };
  elementB: { id: string; label: string; type: string };
  similarity: number;
  conflict: number;
  dominantAxis: NarrativeAxis;
  relationship: 'resonates' | 'tensions' | 'neutral';
}

interface Gap {
  axis: NarrativeAxis;
  coverage: number;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

interface NarrativeLabProps {
  ideas: Array<{ id: string; text: string; weight: number }>;
}

const RELATIONSHIP_COLORS = {
  resonates: 'text-green-700 bg-green-50 border-green-200',
  tensions:  'text-orange-700 bg-orange-50 border-orange-200',
  neutral:   'text-gray-600 bg-gray-50 border-gray-200',
};

const SEVERITY_COLORS = {
  high:   'text-red-700 bg-red-50 border-red-200',
  medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  low:    'text-blue-700 bg-blue-50 border-blue-200',
};

function VectorBar({ value, axis }: { value: number; axis: NarrativeAxis }) {
  const { label } = AXIS_LABELS[axis];
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'bg-indigo-500' : pct >= 40 ? 'bg-indigo-300' : 'bg-gray-200';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-muted shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-right font-mono text-muted">{pct}</span>
    </div>
  );
}

export default function NarrativeLab({ ideas }: NarrativeLabProps) {
  const [items, setItems] = useState<IdeaWithVector[]>(
    ideas.map(i => ({ ...i, vectorized: false }))
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [resonancePairs, setResonancePairs] = useState<ResonancePair[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [unvectorized, setUnvectorized] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'vectors' | 'resonance' | 'gaps'>('vectors');

  const vectorizeIdea = useCallback(async (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, vectorizing: true } : i));
    try {
      const res = await fetch('/api/v1/narrativelab/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId: id, elementType: 'idea' }),
      });
      const data = await res.json();
      if (data.vector) {
        setItems(prev => prev.map(i =>
          i.id === id ? { ...i, vector: data.vector, vectorized: true, vectorizing: false } : i
        ));
      } else {
        setItems(prev => prev.map(i => i.id === id ? { ...i, vectorizing: false } : i));
      }
    } catch {
      setItems(prev => prev.map(i => i.id === id ? { ...i, vectorizing: false } : i));
    }
  }, []);

  const vectorizeAll = async () => {
    const unvect = items.filter(i => !i.vectorized);
    for (const item of unvect) {
      await vectorizeIdea(item.id);
    }
  };

  const analyzeResonance = async () => {
    setAnalyzing(true);
    try {
      const vectorizedItems = items.filter(i => i.vectorized);
      if (vectorizedItems.length < 2) return;

      const res = await fetch('/api/v1/narrativelab/resonance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elements: vectorizedItems.map(i => ({
            id: i.id,
            type: 'idea',
            label: i.text.slice(0, 60),
            weight: i.weight,
          })),
        }),
      });
      const data = await res.json();
      setResonancePairs(data.resonancePairs || []);
      setGaps(data.gaps || []);
      setUnvectorized(data.unvectorized || []);
      setActiveTab('resonance');
    } finally {
      setAnalyzing(false);
    }
  };

  const vectorizedCount = items.filter(i => i.vectorized).length;
  const allVectorized = vectorizedCount === items.length && items.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Narrative Lab</h3>
          <p className="text-xs text-muted">8-axis vector analysis · {vectorizedCount}/{items.length} vectorized</p>
        </div>
        <div className="flex gap-2">
          {!allVectorized && (
            <button
              onClick={vectorizeAll}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-gray-50 transition-colors"
            >
              Vectorize All
            </button>
          )}
          {vectorizedCount >= 2 && (
            <button
              onClick={analyzeResonance}
              disabled={analyzing}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {analyzing ? 'Analyzing...' : 'Analyze'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['vectors', 'resonance', 'gaps'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {tab}
            {tab === 'resonance' && resonancePairs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-[10px]">
                {resonancePairs.length}
              </span>
            )}
            {tab === 'gaps' && gaps.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px]">
                {gaps.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Vectors tab */}
      {activeTab === 'vectors' && (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-foreground leading-snug flex-1 line-clamp-2">{item.text}</p>
                {!item.vectorized && (
                  <button
                    onClick={() => vectorizeIdea(item.id)}
                    disabled={item.vectorizing}
                    className="shrink-0 px-2 py-1 text-[10px] font-medium rounded border border-border text-muted hover:text-foreground hover:border-indigo-300 transition-colors disabled:opacity-50"
                  >
                    {item.vectorizing ? '...' : 'Analyze'}
                  </button>
                )}
              </div>

              {item.vector && (
                <div className="space-y-1 pt-1 border-t border-border">
                  {NARRATIVE_AXES.map(axis => (
                    <VectorBar key={axis} axis={axis} value={item.vector![axis]} />
                  ))}
                </div>
              )}

              {!item.vector && (
                <p className="text-[10px] text-muted italic">
                  Click Analyze to compute narrative vector
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resonance tab */}
      {activeTab === 'resonance' && (
        <div className="space-y-2">
          {resonancePairs.length === 0 ? (
            <p className="text-xs text-muted italic text-center py-4">
              Vectorize at least 2 ideas and click Analyze
            </p>
          ) : (
            resonancePairs.map((pair, i) => (
              <div key={i} className={`border rounded-lg p-3 text-xs ${RELATIONSHIP_COLORS[pair.relationship]}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="space-y-0.5">
                    <p className="font-medium line-clamp-1">"{pair.elementA.label}"</p>
                    <p className="font-medium line-clamp-1">"{pair.elementB.label}"</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold">{Math.round(pair.similarity * 100)}%</p>
                    <p className="text-[10px] capitalize">{pair.relationship}</p>
                  </div>
                </div>
                <p className="text-[10px] opacity-75">
                  Strongest on: {AXIS_LABELS[pair.dominantAxis].label} · 
                  Conflict: {Math.round(pair.conflict * 100)}%
                </p>
              </div>
            ))
          )}
          {unvectorized.length > 0 && (
            <p className="text-[10px] text-muted italic">
              {unvectorized.length} element(s) skipped — not yet vectorized
            </p>
          )}
        </div>
      )}

      {/* Gaps tab */}
      {activeTab === 'gaps' && (
        <div className="space-y-2">
          {gaps.length === 0 && resonancePairs.length > 0 ? (
            <div className="border border-green-200 bg-green-50 rounded-lg p-3 text-xs text-green-700">
              ✓ Good coverage across all narrative axes
            </div>
          ) : gaps.length === 0 ? (
            <p className="text-xs text-muted italic text-center py-4">
              Analyze elements to detect gaps
            </p>
          ) : (
            gaps.map((gap, i) => (
              <div key={i} className={`border rounded-lg p-3 text-xs ${SEVERITY_COLORS[gap.severity]}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{AXIS_LABELS[gap.axis].label} axis</span>
                  <span className="font-mono">{Math.round(gap.coverage * 100)}% coverage</span>
                </div>
                <p className="opacity-80">{gap.suggestion}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
