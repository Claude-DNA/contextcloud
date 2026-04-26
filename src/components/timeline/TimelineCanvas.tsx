'use client';

import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type {
  Track,
  Clip,
  Chapter,
  TimeScale,
} from './types';
import {
  TRACK_ACCENT,
  CLIP_FILL,
  TRACK_CONFIG,
  TIME_SCALES,
} from './types';

export interface TimelineCanvasProps {
  tracks: Track[];
  clips: Clip[];
  chapters: Chapter[];
  readingPointBeat: number;
  selectedClipId: string | null;
  timeScale: TimeScale;
  zoomLevel: number;
  scrollX: number;
  onSelectClip: (clipId: string | null) => void;
  onMoveReadingPoint: (beat: number) => void;
  onScrollXChange: (scrollX: number) => void;
  onZoomChange: (zoom: number) => void;
  onClipMove: (clipId: string, newStartBeat: number) => void;
  onClipResize: (clipId: string, newDuration: number) => void;
}

const TRACK_HEADER_WIDTH = 160;
const BEAT_BASE = 60;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const RULER_HEIGHT = 32;
const CLIP_PAD = 3;
const ACCENT_WIDTH = 3;

// Explicit rounded-rect path. We don't rely on the native
// CanvasRenderingContext2D.roundRect (missing in older Safari / some test envs).
// Begins a fresh path so the caller can just fill() or stroke().
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

interface DragState {
  type: 'clip' | 'clip-resize' | null;
  clipId: string | null;
  startX: number;
  startBeat: number;
  startDuration: number;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
  tracks,
  clips,
  chapters,
  readingPointBeat,
  selectedClipId,
  timeScale,
  zoomLevel,
  scrollX,
  onSelectClip,
  onMoveReadingPoint,
  onScrollXChange,
  onZoomChange,
  onClipMove,
  onClipResize,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1024, height: 600 });
  const [scrollY, setScrollY] = useState(0);
  const [drag, setDrag] = useState<DragState>({ type: null, clipId: null, startX: 0, startBeat: 0, startDuration: 0 });

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(r.width, 100), height: Math.max(r.height, 100) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Canvas DPI — sizing only. The DPR transform is applied per-frame in render()
  // via setTransform, so scaling the context here would be immediately overwritten.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.width * dpr;
    c.height = size.height * dpr;
    c.style.width = size.width + 'px';
    c.style.height = size.height + 'px';
  }, [size]);

  const beatWidth = useMemo(() => BEAT_BASE * zoomLevel, [zoomLevel]);
  const tsConfig = useMemo(() => TIME_SCALES[timeScale], [timeScale]);

  const totalTrackHeight = useMemo(() => tracks.reduce((s, t) => s + t.height, 0), [tracks]);
  const trackYMap = useMemo(() => {
    const m: Record<string, { y: number; h: number }> = {};
    let y = 0;
    for (const t of tracks) {
      m[t.id] = { y, h: t.height };
      y += t.height;
    }
    return m;
  }, [tracks]);
  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  const beatToX = useCallback((beat: number) => beat * beatWidth - scrollX + TRACK_HEADER_WIDTH, [beatWidth, scrollX]);
  const xToBeat = useCallback((x: number) => (x - TRACK_HEADER_WIDTH + scrollX) / beatWidth, [beatWidth, scrollX]);

  // ──── RENDER ────
  const render = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.save();
    // Reset transform for HiDPI
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = size.width;
    const H = size.height;

    // Background
    ctx.fillStyle = '#1a1d23';
    ctx.fillRect(0, 0, W, H);

    // --- Ruler ---
    ctx.fillStyle = '#1e2128';
    ctx.fillRect(TRACK_HEADER_WIDTH, 0, W - TRACK_HEADER_WIDTH, RULER_HEIGHT);
    ctx.strokeStyle = '#2a2e36';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(TRACK_HEADER_WIDTH, RULER_HEIGHT);
    ctx.lineTo(W, RULER_HEIGHT);
    ctx.stroke();

    const startUnit = Math.floor(scrollX / beatWidth);
    const endUnit = Math.ceil((scrollX + W - TRACK_HEADER_WIDTH) / beatWidth) + 1;

    for (let u = Math.max(0, startUnit); u <= endUnit; u++) {
      const x = beatToX(u);
      if (x < TRACK_HEADER_WIDTH - 1 || x > W + 1) continue;

      const isMajor = u % tsConfig.majorTickEvery === 0;
      const isMinor = u % tsConfig.minorTickEvery === 0;

      if (isMajor) {
        ctx.strokeStyle = '#3a3f4a';
        ctx.beginPath(); ctx.moveTo(x, RULER_HEIGHT - 14); ctx.lineTo(x, RULER_HEIGHT); ctx.stroke();
        ctx.fillStyle = '#8a8f99';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(tsConfig.formatLabel(u), x, RULER_HEIGHT - 16);

        // Faint vertical grid
        ctx.strokeStyle = '#22262e';
        ctx.beginPath(); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, H); ctx.stroke();
      } else if (isMinor) {
        ctx.strokeStyle = '#2a2e36';
        ctx.beginPath(); ctx.moveTo(x, RULER_HEIGHT - 6); ctx.lineTo(x, RULER_HEIGHT); ctx.stroke();
      }
    }

    // --- Chapter markers ---
    chapters.forEach((ch) => {
      const x1 = beatToX(ch.startBeat);
      const x2 = beatToX(ch.endBeat);
      const w = x2 - x1;
      if (x2 < TRACK_HEADER_WIDTH || x1 > W) return;

      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(Math.max(x1, TRACK_HEADER_WIDTH), RULER_HEIGHT - 3, Math.min(w, W - Math.max(x1, TRACK_HEADER_WIDTH)), 3);

      if (w > 60) {
        ctx.fillStyle = '#6a6f7a';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch.title, Math.max(x1 + 6, TRACK_HEADER_WIDTH + 4), RULER_HEIGHT / 2);
      }
    });

    // --- Track lanes ---
    tracks.forEach((track, i) => {
      const ty = trackYMap[track.id];
      if (!ty) return;
      const y = ty.y + RULER_HEIGHT - scrollY;
      if (y + ty.h < RULER_HEIGHT || y > H) return;

      ctx.fillStyle = i % 2 === 0 ? '#1e2128' : '#1c1f26';
      ctx.fillRect(TRACK_HEADER_WIDTH, y, W - TRACK_HEADER_WIDTH, ty.h);

      ctx.strokeStyle = '#22262e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(TRACK_HEADER_WIDTH, y + ty.h);
      ctx.lineTo(W, y + ty.h);
      ctx.stroke();
    });

    // --- Clips ---
    clips.forEach((clip) => {
      const ty = trackYMap[clip.trackId];
      if (!ty) return;
      const track = trackById.get(clip.trackId);
      if (!track) return;

      const x = beatToX(clip.startBeat);
      const w = clip.duration * beatWidth;
      const y = ty.y + RULER_HEIGHT - scrollY + CLIP_PAD;
      const h = ty.h - CLIP_PAD * 2;

      if (x + w < TRACK_HEADER_WIDTH || x > W) return;

      const isSelected = clip.id === selectedClipId;
      const fillColors = CLIP_FILL[track.type];
      const accentColor = clip.clipColor || TRACK_ACCENT[track.type];

      if (track.type === 'state' && clip.stateFormula) {
        // State clips: subtle colored bar
        ctx.fillStyle = clip.stateFormula.color;
        ctx.globalAlpha = isSelected ? 0.7 : 0.5;
        ctx.fillRect(x, ty.y + RULER_HEIGHT - scrollY, w, ty.h);
        ctx.globalAlpha = 1;

        ctx.fillStyle = clip.stateFormula.color;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x, ty.y + RULER_HEIGHT - scrollY, w, 2);
        ctx.globalAlpha = 1;

        if (w > 30) {
          ctx.fillStyle = '#9a9faa';
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const label = clip.characterLabel ? `${clip.characterLabel}: ${clip.title}` : clip.title;
          ctx.fillText(label.substring(0, Math.floor(w / 5)), Math.max(x + 4, TRACK_HEADER_WIDTH + 2), ty.y + RULER_HEIGHT - scrollY + ty.h / 2);
        }
      } else if (track.type === 'reference') {
        // Reference: small dot marker
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = isSelected ? 0.9 : 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (w > 10) {
          ctx.fillStyle = '#7a7f8a';
          ctx.font = '8px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(clip.title.substring(0, 12), cx + 8, cy + 3);
        }
      } else {
        // Normal clip: muted fill + thin left accent
        const fillColor = isSelected ? fillColors.selected : fillColors.normal;
        roundRect(ctx, x, y, w, h, 3);
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Left accent bar
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = isSelected ? 1.0 : 0.7;
        ctx.fillRect(x, y, ACCENT_WIDTH, h);
        ctx.globalAlpha = 1;

        // Title
        if (w > 40) {
          const label = clip.characterLabel ? `${clip.characterLabel} — ${clip.title}` : clip.title;
          ctx.fillStyle = isSelected ? '#d0d4dd' : '#8a8f99';
          ctx.font = `${isSelected ? 'bold ' : ''}10px sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const textX = Math.max(x + ACCENT_WIDTH + 6, TRACK_HEADER_WIDTH + 2);
          const maxW = Math.min(w - ACCENT_WIDTH - 12, W - textX - 4);
          if (maxW > 20) {
            ctx.fillText(label.substring(0, Math.floor(maxW / 5.5)), textX, y + h / 2);
          }
        }

        // Selection: subtle border
        if (isSelected) {
          ctx.strokeStyle = '#5a6a8a';
          ctx.lineWidth = 1.5;
          roundRect(ctx, x, y, w, h, 3);
          ctx.stroke();
        }
      }
    });

    // --- Reading point ---
    const rpx = beatToX(readingPointBeat);
    if (rpx >= TRACK_HEADER_WIDTH && rpx <= W) {
      ctx.strokeStyle = '#c8553d';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rpx, RULER_HEIGHT); ctx.lineTo(rpx, H); ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#c8553d';
      ctx.beginPath();
      ctx.moveTo(rpx - 5, 0);
      ctx.lineTo(rpx + 5, 0);
      ctx.lineTo(rpx, 8);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#c8553d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rpx, 0); ctx.lineTo(rpx, RULER_HEIGHT); ctx.stroke();
    }

    // --- Track headers ---
    ctx.fillStyle = '#1a1d23';
    ctx.fillRect(0, 0, TRACK_HEADER_WIDTH, H);

    ctx.strokeStyle = '#2a2e36';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TRACK_HEADER_WIDTH, 0); ctx.lineTo(TRACK_HEADER_WIDTH, H); ctx.stroke();

    ctx.fillStyle = '#1e2128';
    ctx.fillRect(0, 0, TRACK_HEADER_WIDTH, RULER_HEIGHT);

    ctx.fillStyle = '#5a5f6a';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tsConfig.label.toUpperCase(), TRACK_HEADER_WIDTH / 2, RULER_HEIGHT / 2);

    tracks.forEach((track) => {
      const ty = trackYMap[track.id];
      if (!ty) return;
      const y = ty.y + RULER_HEIGHT - scrollY;
      if (y + ty.h < RULER_HEIGHT || y > H) return;

      const centerY = y + ty.h / 2;

      // Accent dot
      ctx.fillStyle = TRACK_CONFIG[track.type].accent;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(14, centerY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Type letter
      ctx.fillStyle = '#6a6f7a';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(TRACK_CONFIG[track.type].icon, 24, centerY);

      // Label
      ctx.fillStyle = '#8a8f99';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(track.label, 42, centerY);

      // M/S
      const mx = TRACK_HEADER_WIDTH - 30;
      const sx = TRACK_HEADER_WIDTH - 14;

      ctx.fillStyle = track.muted ? '#5a3a3a' : '#2a2e36';
      ctx.fillRect(mx, centerY - 5, 10, 10);
      ctx.fillStyle = track.muted ? '#aa6a6a' : '#4a4f5a';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('M', mx + 5, centerY + 1);

      ctx.fillStyle = track.solo ? '#5a4a2a' : '#2a2e36';
      ctx.fillRect(sx, centerY - 5, 10, 10);
      ctx.fillStyle = track.solo ? '#aa8a4a' : '#4a4f5a';
      ctx.fillText('S', sx + 5, centerY + 1);

      // Bottom border
      ctx.strokeStyle = '#22262e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + ty.h);
      ctx.lineTo(TRACK_HEADER_WIDTH, y + ty.h);
      ctx.stroke();
    });

    ctx.restore();
  }, [tracks, clips, chapters, readingPointBeat, selectedClipId, beatWidth, scrollX, scrollY, size, trackYMap, trackById, beatToX, tsConfig]);

  // Render on state change via a single RAF schedule — collapses bursts of
  // dep changes in one tick into a single draw and keeps CPU at 0 when idle.
  useEffect(() => {
    const id = requestAnimationFrame(render);
    return () => cancelAnimationFrame(id);
  }, [render]);

  // Mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (mx < TRACK_HEADER_WIDTH) return;

    const beat = xToBeat(mx);
    let hitClip: Clip | null = null;
    let hitEdge = false;

    for (const clip of clips) {
      const ty = trackYMap[clip.trackId];
      if (!ty) continue;
      const track = trackById.get(clip.trackId);
      if (!track) continue;

      const cx = beatToX(clip.startBeat);
      const cw = clip.duration * beatWidth;
      const cy = ty.y + RULER_HEIGHT - scrollY + CLIP_PAD;
      const ch = ty.h - CLIP_PAD * 2;

      if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
        hitClip = clip;
        if (mx > cx + cw - 8) hitEdge = true;
        break;
      }
    }

    if (hitClip) {
      onSelectClip(hitClip.id);
      setDrag({
        type: hitEdge ? 'clip-resize' : 'clip',
        clipId: hitClip.id,
        startX: mx,
        startBeat: hitEdge ? beat : hitClip.startBeat,
        startDuration: hitClip.duration,
      });
    } else {
      onSelectClip(null);
      if (beat >= 0) onMoveReadingPoint(Math.round(beat));
    }
  }, [clips, trackById, trackYMap, beatWidth, scrollY, beatToX, xToBeat, onSelectClip, onMoveReadingPoint]);

  // Window-level drag listeners so dragging a clip keeps working when the
  // cursor leaves the canvas (Premiere behavior). Only attached while a drag
  // is active to avoid unnecessary listener overhead.
  useEffect(() => {
    if (drag.type === null || !drag.clipId) return;
    const onMove = (e: MouseEvent) => {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const beat = xToBeat(mx);

      if (drag.type === 'clip') {
        const delta = Math.round(beat - xToBeat(drag.startX));
        onClipMove(drag.clipId!, Math.max(0, drag.startBeat + delta));
      } else if (drag.type === 'clip-resize') {
        const delta = Math.round(beat - drag.startBeat);
        onClipResize(drag.clipId!, Math.max(1, drag.startDuration + delta));
      }
    };
    const onUp = () => {
      setDrag({ type: null, clipId: null, startX: 0, startBeat: 0, startDuration: 0 });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, xToBeat, onClipMove, onClipResize]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const d = e.deltaY > 0 ? 0.9 : 1.1;
      onZoomChange(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel * d)));
    } else if (e.shiftKey) {
      onScrollXChange(Math.max(0, scrollX + e.deltaY));
    } else {
      const maxScrollY = Math.max(0, totalTrackHeight + RULER_HEIGHT - size.height);
      setScrollY(prev => Math.min(maxScrollY, Math.max(0, prev + e.deltaY)));
    }
  }, [zoomLevel, scrollX, totalTrackHeight, size.height, onZoomChange, onScrollXChange]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#1a1d23' }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ display: 'block', cursor: drag.type ? 'ew-resize' : 'default' }}
      />
    </div>
  );
};
