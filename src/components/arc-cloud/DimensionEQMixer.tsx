'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Dimensions {
  characters_pct: number;
  ideas_pct: number;
  scene_pct: number;
  arc_pct: number;
  predictability: number;
}

interface DimensionEQMixerProps {
  plotId: string;
  initialDimensions?: Dimensions;
  onSave: (dimensions: Dimensions) => void;
}

const DEFAULT_DIMENSIONS: Dimensions = {
  characters_pct: 25,
  ideas_pct: 25,
  scene_pct: 25,
  arc_pct: 25,
  predictability: 50,
};

const DIMENSION_KEYS = ['characters_pct', 'ideas_pct', 'scene_pct', 'arc_pct'] as const;
type DimensionKey = typeof DIMENSION_KEYS[number];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  characters_pct: 'Characters',
  ideas_pct: 'Ideas',
  scene_pct: 'Scene',
  arc_pct: 'Arc',
};

export default function DimensionEQMixer({ plotId, initialDimensions, onSave }: DimensionEQMixerProps) {
  const [dimensions, setDimensions] = useState<Dimensions>(initialDimensions || DEFAULT_DIMENSIONS);
  const [loading, setLoading] = useState(!initialDimensions);
  const [saving, setSaving] = useState(false);

  const fetchWeights = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/plots/${plotId}/weights`);
      if (res.ok) {
        const data = await res.json();
        if (data.dimensions) {
          setDimensions({
            characters_pct: Number(data.dimensions.characters_pct) || 25,
            ideas_pct: Number(data.dimensions.ideas_pct) || 25,
            scene_pct: Number(data.dimensions.scene_pct) || 25,
            arc_pct: Number(data.dimensions.arc_pct) || 25,
            predictability: Number(data.dimensions.predictability) ?? 50,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch weights:', err);
    } finally {
      setLoading(false);
    }
  }, [plotId]);

  useEffect(() => {
    if (!initialDimensions) {
      fetchWeights();
    }
  }, [fetchWeights, initialDimensions]);

  const handleDimensionChange = (key: DimensionKey, newValue: number) => {
    const clamped = Math.min(100, Math.max(0, newValue));
    const remaining = 100 - clamped;
    const otherKeys = DIMENSION_KEYS.filter(k => k !== key);
    const otherTotal = otherKeys.reduce((sum, k) => sum + dimensions[k], 0);

    const updated = { ...dimensions, [key]: clamped };

    if (otherTotal === 0) {
      const each = Math.round(remaining / otherKeys.length);
      let allocated = 0;
      otherKeys.forEach((k, i) => {
        if (i === otherKeys.length - 1) {
          updated[k] = remaining - allocated;
        } else {
          updated[k] = each;
          allocated += each;
        }
      });
    } else {
      let allocated = 0;
      otherKeys.forEach((k, i) => {
        if (i === otherKeys.length - 1) {
          updated[k] = remaining - allocated;
        } else {
          const proportion = dimensions[k] / otherTotal;
          const val = Math.round(remaining * proportion);
          updated[k] = val;
          allocated += val;
        }
      });
    }

    setDimensions(updated);
  };

  const handlePredictabilityChange = (value: number) => {
    setDimensions(prev => ({ ...prev, predictability: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/v1/plots/${plotId}/weights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions }),
      });
      onSave(dimensions);
    } catch (err) {
      console.error('Failed to save weights:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-muted py-2">Loading weights...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">Dimension Mix</h4>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {DIMENSION_KEYS.map(key => (
        <div key={key} className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-foreground">{DIMENSION_LABELS[key]}</label>
            <span className="text-xs font-mono text-muted w-10 text-right">{Math.round(dimensions[key])}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={dimensions[key]}
            onChange={(e) => handleDimensionChange(key, Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
        </div>
      ))}

      <div className="pt-2 border-t border-border space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Chaotic</span>
          <span className="text-xs font-semibold text-foreground">Predictability</span>
          <span className="text-xs text-muted">Predictable</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={dimensions.predictability}
          onChange={(e) => handlePredictabilityChange(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="text-center">
          <span className="text-xs font-mono text-muted">{dimensions.predictability}</span>
        </div>
      </div>
    </div>
  );
}
