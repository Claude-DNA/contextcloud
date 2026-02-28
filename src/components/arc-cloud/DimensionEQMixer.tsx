'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Dimensions {
  characters_pct: number;
  ideas_pct: number;
  scene_pct: number;
  arc_pct: number;
  predictability: number;
}

interface Locks {
  characters_pct: boolean;
  ideas_pct: boolean;
  scene_pct: boolean;
  arc_pct: boolean;
  predictability: boolean;
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

const DEFAULT_LOCKS: Locks = {
  characters_pct: false,
  ideas_pct: false,
  scene_pct: false,
  arc_pct: false,
  predictability: false,
};

const DIMENSION_KEYS = ['characters_pct', 'ideas_pct', 'scene_pct', 'arc_pct'] as const;
type DimensionKey = typeof DIMENSION_KEYS[number];

const DIMENSION_LABELS: Record<DimensionKey, { label: string; emoji: string }> = {
  characters_pct: { label: 'Characters', emoji: '👤' },
  ideas_pct:      { label: 'Ideas',      emoji: '💡' },
  scene_pct:      { label: 'Scene',      emoji: '🌍' },
  arc_pct:        { label: 'Arc',        emoji: '⚡' },
};

export default function DimensionEQMixer({ plotId, initialDimensions, onSave }: DimensionEQMixerProps) {
  const [dimensions, setDimensions] = useState<Dimensions>(initialDimensions || DEFAULT_DIMENSIONS);
  const [locks, setLocks] = useState<Locks>(DEFAULT_LOCKS);
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
    if (!initialDimensions) fetchWeights();
  }, [fetchWeights, initialDimensions]);

  const toggleLock = (key: keyof Locks) => {
    setLocks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDimensionChange = (key: DimensionKey, newValue: number) => {
    if (locks[key]) return; // locked — ignore
    const clamped = Math.min(100, Math.max(0, newValue));

    // Only redistribute among unlocked dimensions (excluding the one being changed)
    const unlocked = DIMENSION_KEYS.filter(k => k !== key && !locks[k]);
    const locked = DIMENSION_KEYS.filter(k => k !== key && locks[k]);
    const lockedSum = locked.reduce((sum, k) => sum + dimensions[k], 0);
    const remaining = 100 - clamped - lockedSum;

    const updated = { ...dimensions, [key]: clamped };

    if (unlocked.length === 0) {
      // All others locked — can't redistribute, snap back
      return;
    }

    const unlockedTotal = unlocked.reduce((sum, k) => sum + dimensions[k], 0);

    if (unlockedTotal === 0) {
      const each = Math.round(remaining / unlocked.length);
      let allocated = 0;
      unlocked.forEach((k, i) => {
        if (i === unlocked.length - 1) {
          updated[k] = Math.max(0, remaining - allocated);
        } else {
          updated[k] = Math.max(0, each);
          allocated += each;
        }
      });
    } else {
      let allocated = 0;
      unlocked.forEach((k, i) => {
        if (i === unlocked.length - 1) {
          updated[k] = Math.max(0, remaining - allocated);
        } else {
          const proportion = dimensions[k] / unlockedTotal;
          const val = Math.round(remaining * proportion);
          updated[k] = Math.max(0, val);
          allocated += val;
        }
      });
    }

    setDimensions(updated);
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

  if (loading) return <p className="text-xs text-muted py-2">Loading weights...</p>;

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

      {DIMENSION_KEYS.map(key => {
        const { label, emoji } = DIMENSION_LABELS[key];
        const isLocked = locks[key];
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">{emoji}</span>
              <label className="text-xs text-foreground flex-1">{label}</label>
              <span className="text-xs font-mono text-muted w-8 text-right">{Math.round(dimensions[key])}%</span>
              {/* Lock box */}
              <button
                onClick={() => toggleLock(key)}
                title={isLocked ? 'Unlock' : 'Lock'}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors text-[10px] ${
                  isLocked
                    ? 'bg-amber-100 border-amber-400 text-amber-600'
                    : 'border-border text-muted hover:border-amber-300'
                }`}
              >
                {isLocked ? '🔒' : '○'}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={dimensions[key]}
              disabled={isLocked}
              onChange={e => handleDimensionChange(key, Number(e.target.value))}
              className={`w-full accent-indigo-500 ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
            />
          </div>
        );
      })}

      {/* Predictability — independent, own lock */}
      <div className="pt-2 border-t border-border space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted flex-1">🌀 Chaotic → Predictable 📐</span>
          <span className="text-xs font-mono text-muted w-8 text-right">{dimensions.predictability}</span>
          <button
            onClick={() => toggleLock('predictability')}
            title={locks.predictability ? 'Unlock' : 'Lock'}
            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors text-[10px] ${
              locks.predictability
                ? 'bg-amber-100 border-amber-400 text-amber-600'
                : 'border-border text-muted hover:border-amber-300'
            }`}
          >
            {locks.predictability ? '🔒' : '○'}
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={dimensions.predictability}
          disabled={locks.predictability}
          onChange={e => setDimensions(prev => ({ ...prev, predictability: Number(e.target.value) }))}
          className={`w-full accent-indigo-500 ${locks.predictability ? 'opacity-40 cursor-not-allowed' : ''}`}
        />
      </div>
    </div>
  );
}
