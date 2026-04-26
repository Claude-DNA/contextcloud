'use client';

import React, { useState } from 'react';
import { Clip, Track, TRACK_CONFIG, STATE_COLORS } from './types';

interface EditorPanelProps {
  clip: Clip | null;
  track: Track | null;
  onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  clip,
  track,
  onUpdateClip,
}) => {
  const [localTitle, setLocalTitle] = useState(clip?.title || '');
  const [localContent, setLocalContent] = useState(clip?.content || '');
  const [localDimensions, setLocalDimensions] = useState(
    clip?.dimensionWeights || { characters: 25, ideas: 25, scene: 25, arc: 25 }
  );
  const [localPredictability, setLocalPredictability] = useState(
    clip?.predictability ?? 50
  );

  React.useEffect(() => {
    setLocalTitle(clip?.title || '');
    setLocalContent(clip?.content || '');
    setLocalDimensions(
      clip?.dimensionWeights || { characters: 25, ideas: 25, scene: 25, arc: 25 }
    );
    setLocalPredictability(clip?.predictability ?? 50);
  }, [clip?.id]);

  if (!clip || !track) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1a1d23] border-l border-[#2a2e36] text-[#5a5f6a]">
        <p className="text-center px-4 text-xs">Select a clip to edit</p>
      </div>
    );
  }

  const trackConfig = TRACK_CONFIG[track.type];
  const dimensionSum = Object.values(localDimensions).reduce((a, b) => a + b, 0);
  const stateColor = clip.stateFormula ? STATE_COLORS[clip.stateFormula.base[0]] : null;

  const handleTitleChange = (value: string) => {
    setLocalTitle(value);
  };

  const handleTitleBlur = () => {
    if (localTitle !== clip.title) {
      onUpdateClip(clip.id, { title: localTitle });
    }
  };

  const handleContentChange = (value: string) => {
    setLocalContent(value);
  };

  const handleContentBlur = () => {
    if (localContent !== clip.content) {
      onUpdateClip(clip.id, { content: localContent });
    }
  };

  const handleDimensionChange = (dimension: 'characters' | 'ideas' | 'scene' | 'arc', value: number) => {
    const updated = { ...localDimensions, [dimension]: value };
    setLocalDimensions(updated);
    onUpdateClip(clip.id, { dimensionWeights: updated });
  };

  const handlePredictabilityChange = (value: number) => {
    setLocalPredictability(value);
    onUpdateClip(clip.id, { predictability: value });
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1d23] border-l border-[#2a2e36] text-[#c0c4cc] overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2e36] flex items-center gap-2 flex-shrink-0">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: trackConfig.accent }} />
        <span className="text-xs font-bold text-[#6a6f7a] tracking-wide">{trackConfig.icon}</span>
        <span className="text-sm font-medium text-[#8a8f99]">{trackConfig.label}</span>
        {clip.characterLabel && <span className="text-xs text-[#6a6f7a]">({clip.characterLabel})</span>}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
            Clip Title
          </label>
          <input
            type="text"
            value={localTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={handleTitleBlur}
            className="w-full px-3 py-2 bg-white/5 border border-[#2a2e36] rounded text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#5a6a8a] focus:bg-white/10 transition-colors"
            placeholder="Enter clip title"
          />
        </div>

        {/* Content */}
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
            Content
          </label>
          <textarea
            value={localContent}
            onChange={(e) => handleContentChange(e.target.value)}
            onBlur={handleContentBlur}
            className="w-full px-3 py-2 bg-white/5 border border-[#2a2e36] rounded text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#5a6a8a] focus:bg-white/10 transition-colors resize-none"
            style={{ minHeight: '200px' }}
            placeholder="Enter clip content"
          />
        </div>

        {/* Dimension Weights — always shown; default is 25/25/25/25 until the
            user overrides. Prior gating on `clip.dimensionWeights` meant most
            demo clips could never set weights. */}
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">
            Dimension Weights {dimensionSum !== 100 && <span className="text-orange-400 ml-2">Sum: {dimensionSum}</span>}
          </label>
            <div className="space-y-3">
              {['characters', 'ideas', 'scene', 'arc'].map((dim) => (
                <div key={dim}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-white/70 capitalize">{dim}</label>
                    <span className="text-xs text-white/50">{localDimensions[dim as keyof typeof localDimensions]}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localDimensions[dim as keyof typeof localDimensions]}
                    onChange={(e) =>
                      handleDimensionChange(
                        dim as 'characters' | 'ideas' | 'scene' | 'arc',
                        parseInt(e.target.value)
                      )
                    }
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#5a6a8a]"
                  />
                </div>
              ))}
            </div>
          </div>

        {/* State Formula */}
        {clip.stateFormula && stateColor && (
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
              State
            </label>
            <div className="flex items-center gap-2 p-2 bg-white/5 rounded border border-[#2a2e36]">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: stateColor.hex }}
              />
              <span className="text-sm capitalize text-white">{stateColor.label}</span>
            </div>
          </div>
        )}

        {/* Idea Weights */}
        {clip.ideaWeights && (
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
              Idea Weights
            </label>
            <div className="space-y-1 text-xs">
              {Object.entries(clip.ideaWeights).map(([idea, weight]) => (
                <div key={idea} className="flex items-center justify-between p-2 bg-white/5 rounded">
                  <span className="text-white/70">{idea}</span>
                  <span className="text-white/50">{weight}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Predictability — always shown; default 50 until overridden. */}
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
            Predictability
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              value={localPredictability}
              onChange={(e) => handlePredictabilityChange(parseInt(e.target.value))}
              className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#5a6a8a]"
            />
            <span className="text-sm text-white/50 min-w-[40px]">{localPredictability}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
