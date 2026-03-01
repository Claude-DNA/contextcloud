'use client';

import React, { memo, useCallback, useContext, Fragment, useState, useEffect } from 'react';
import Link from 'next/link';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { STATE_COLORS, NODE_TYPE_MAP, TYPED_HANDLES, OUTPUT_HANDLES, HUB_HANDLES, AI_NODE_CONFIG } from './nodeTypes';
import { GraphContext } from './GraphContext';
import { type LucideProps } from 'lucide-react';
import * as Icons from 'lucide-react';

// Resolve a Lucide icon by name
function getIcon(name?: string): React.ComponentType<LucideProps> | null {
  if (!name) return null;
  return (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name] || null;
}

export interface GraphNodeData {
  type: string;
  label: string;
  emoji: string;
  color: string;
  title: string;
  content: string;
  isProxy?: boolean;
  isContainer?: boolean;
  parentNodeId?: string;
  parentLabel?: string;
  stateColor?: string | null;
  generatedImage?: string | null;
  graphId?: string;
  onTitleChange: (id: string, title: string) => void;
  onContentChange: (id: string, content: string) => void;
  onZoomToParent?: (parentNodeId: string) => void;
  onStateColorChange?: (id: string, color: string) => void;
  onImageGenerated?: (id: string, url: string) => void;
  onDelete?: (id: string) => void;
  /** Chapter canvas mode: source handle direction; also disables target handle */
  handleSide?: 'top' | 'bottom' | 'left' | 'right';
  [key: string]: unknown;
}

/* --- Icon Badge --- reusable colored square with Lucide icon --- */
function IconBadge({ color, type, size = 36 }: { color: string; type: string; size?: number }) {
  const config = NODE_TYPE_MAP[type];
  const IconComp = getIcon(config?.icon);
  return (
    <div
      className="rounded text-white flex items-center justify-center shrink-0"
      style={{ backgroundColor: color, width: size, height: size }}
    >
      {IconComp ? <IconComp size={16} strokeWidth={2} className="text-white" /> : (
        <span className="text-[10px] font-bold">{config?.abbr || type.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

/* --- ProxyNode --- compact badge node for characterProxy / sceneProxy --- */
function ProxyNode({ id, data, selected }: { id: string; data: GraphNodeData; selected?: boolean }) {
  const { color, parentNodeId, stateColor, onZoomToParent, onDelete, type, handleSide } = data;
  const { bigNodes, onParentChange } = useContext(GraphContext);
  const posMap = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right } as const;

  const handleClick = useCallback(() => {
    if (parentNodeId && onZoomToParent) onZoomToParent(parentNodeId);
  }, [parentNodeId, onZoomToParent]);

  // Chapter canvas mode — compact, no target handle, source at handleSide
  if (handleSide) {
    const srcPos = posMap[handleSide as keyof typeof posMap] ?? Position.Top;
    return (
      <div className="group relative rounded-lg shadow-sm">
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold leading-none"
            title="Delete node"
          >{'\u00D7'}</button>
        )}
        <div
          style={{
            width: 100, height: 46,
            border: selected ? `2px solid ${color}` : `2px solid ${color}50`,
            background: '#ffffff', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
          }}
        >
          <Handle type="source" position={srcPos} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-white" />
          <IconBadge color={color} type={type} size={26} />
          <span className="text-[9px] text-gray-600 font-medium truncate">{NODE_TYPE_MAP[type]?.label || type}</span>
        </div>
      </div>
    );
  }

  // Default mode — left target + right source + link dropdown
  return (
    <div className="group relative rounded-lg shadow-sm">
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold leading-none"
          title="Delete node"
        >{'\u00D7'}</button>
      )}
      <div
        onClick={handleClick}
        className="cursor-pointer"
        style={{
          width: 120, minHeight: 60,
          border: selected ? `2px solid ${color}` : `2px solid ${color}40`,
          boxShadow: selected ? `0 0 0 2px ${color}40` : undefined,
          background: '#ffffff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, overflow: 'hidden',
        }}
      >
        <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-gray-300" />
        <div
          className="absolute"
          style={{ top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: stateColor || '#d1d5db', border: '2px solid #e5e7eb', zIndex: 2 }}
        />
        <IconBadge color={color} type={type} />
        <select
          value={parentNodeId || ''}
          onChange={(e) => {
            const opt = (bigNodes || []).find(n => n.id === e.target.value);
            if (opt && onParentChange) onParentChange(id, opt.id, opt.label);
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag nopan text-[9px] bg-gray-100 text-gray-700 border border-gray-300 rounded px-1 py-0.5 w-full max-w-[100px] mt-1"
        >
          <option value="">Link to node...</option>
          {(bigNodes || []).map(n => (
            <option key={n.id} value={n.id}>{n.label || n.id}</option>
          ))}
        </select>
        <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-gray-300" />
      </div>
    </div>
  );
}

/* --- StateNode --- small square with 6-color picker --- */
function StateNode({ id, data }: { id: string; data: GraphNodeData }) {
  const { stateColor, onStateColorChange, onDelete } = data;

  const handleColorPick = useCallback(
    (hex: string) => {
      if (onStateColorChange) {
        onStateColorChange(id, hex);
      }
    },
    [id, onStateColorChange]
  );

  return (
    <div className="group relative">
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold leading-none"
          title="Delete node"
        >{'\u00D7'}</button>
      )}
    <div
      className="rounded-lg shadow-sm"
      style={{
        width: 100,
        height: 100,
        background: stateColor
          ? `${stateColor}1A`
          : '#ffffff',
        border: stateColor ? `2px solid ${stateColor}` : '2px solid #d1d5db',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-gray-300" />

      <IconBadge color="#888888" type="state" />
      <span className="text-[11px] text-gray-600 font-medium">State</span>

      {/* Color picker -- 6 circles */}
      <div className="flex gap-1 flex-wrap justify-center px-1">
        {Object.entries(STATE_COLORS).map(([key, { hex }]) => (
          <button
            key={key}
            onClick={() => handleColorPick(hex)}
            title={STATE_COLORS[key as keyof typeof STATE_COLORS].label}
            className="transition-transform hover:scale-125"
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: hex,
              border: stateColor === hex ? '2px solid #374151' : '1px solid #d1d5db',
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-gray-300" />
    </div>
    </div>
  );
}

/* --- Reference node types --- */
const REFERENCE_TYPES = new Set(['musicReference', 'bookReference', 'artReference', 'filmReference', 'realEventReference']);

/* --- ReferenceNode --- compact card --- */
function ReferenceNode({ id, data, selected }: { id: string; data: GraphNodeData; selected?: boolean }) {
  const { color, onDelete, type } = data;
  const externalTitle = (data.externalTitle || data.title) as string;
  const config = NODE_TYPE_MAP[type];
  const refLabel = config?.label || 'Reference';

  return (
    <div
      className="group relative bg-white rounded-lg transition-shadow"
      style={{
        width: 160,
        height: 50,
        border: selected ? `2px solid ${color}` : `1px solid ${color}60`,
        boxShadow: selected ? `0 0 0 2px ${color}40` : undefined,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 8,
      }}
    >
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold"
        >{'\u00D7'}</button>
      )}
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-2.5 !h-2.5" />

      <IconBadge color={color} type={type} />
      <div className="flex flex-col overflow-hidden min-w-0">
        <span className="text-xs text-gray-800 font-medium truncate">{externalTitle || 'Untitled'}</span>
        <span className="text-[9px] text-gray-400 truncate">{refLabel}</span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-2.5 !h-2.5" />
    </div>
  );
}

/* --- HubNode --- 4-directional: top/bottom=chain, left=clouds, right=injections --- */
const HUB_NODE_SIZES: Record<string, { width: number; minHeight: number }> = {
  chapterPlot: { width: 200, minHeight: 72 },
};
function HubNode({ id, data, selected }: { id: string; data: GraphNodeData; selected?: boolean }) {
  const { type, color, title, onDelete } = data;
  const chapterId = data.chapterId as string | undefined;
  const size = HUB_NODE_SIZES[type] || { width: 190, minHeight: 72 };
  const config = NODE_TYPE_MAP[type];
  const nodeLabel = config?.label || type;
  const handles = HUB_HANDLES[type] || [];

  const posMap = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right } as const;

  return (
    <div
      className="group relative bg-white rounded-xl hover:shadow-md"
      style={{
        width: size.width, minHeight: size.minHeight,
        border: selected ? `2px solid ${color}` : `1.5px solid #e5e7eb`,
        boxShadow: selected ? `0 0 0 3px ${color}22` : '0 1px 3px rgba(0,0,0,0.06)',
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        position: 'relative', overflow: 'visible',
      }}
    >
      {/* Handles with labels outside card */}
      {handles.map((h) => {
        const isHoriz = h.position === 'left' || h.position === 'right';
        const handleStyle: React.CSSProperties = {
          background: h.color, width: 9, height: 9,
          border: '2px solid white', boxShadow: `0 0 0 1.5px ${h.color}55`,
          ...(isHoriz ? { top: h.offset || '50%' } : { left: h.offset || '50%' }),
        };
        // Label positioned outside the card
        const labelStyle: React.CSSProperties = {
          position: 'absolute', fontSize: 8, color: h.color,
          whiteSpace: 'nowrap', fontWeight: 600, pointerEvents: 'none',
          ...(h.position === 'left'   && { right: 'calc(100% + 12px)', top: h.offset || '50%', transform: 'translateY(-50%)', textAlign: 'right' }),
          ...(h.position === 'right'  && { left:  'calc(100% + 12px)', top: h.offset || '50%', transform: 'translateY(-50%)' }),
          ...(h.position === 'top'    && { bottom: 'calc(100% + 6px)', left: h.offset || '50%', transform: 'translateX(-50%)' }),
          ...(h.position === 'bottom' && { top:  'calc(100% + 6px)',   left: h.offset || '50%', transform: 'translateX(-50%)' }),
        };
        return (
          <Fragment key={h.id}>
            <Handle type={h.type} position={posMap[h.position]} id={h.id} style={handleStyle} />
            <span style={labelStyle}>{h.label}</span>
          </Fragment>
        );
      })}

      {/* Delete */}
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold"
          title="Delete node">×</button>
      )}

      {/* Content */}
      <IconBadge color={color} type={type} size={26} />
      <div className="flex flex-col overflow-hidden min-w-0 flex-1">
        <span className="text-[11px] text-gray-800 font-semibold leading-tight line-clamp-2">{title || 'Untitled'}</span>
        <span className="text-[9px] text-gray-400 truncate mt-0.5">{nodeLabel}</span>
        {chapterId && (
          <Link
            href={`/workspace/visual/chapter/${chapterId}`}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            className="nodrag nopan text-[9px] text-indigo-500 hover:text-indigo-700 font-medium mt-0.5 truncate"
          >
            Open plots →
          </Link>
        )}
      </div>
    </div>
  );
}

/* --- TypedHandleNode --- for arc, motivation with multiple labeled input handles --- */
function TypedHandleNode({ id, data, selected }: { id: string; data: GraphNodeData; selected?: boolean }) {
  const { type, color, title, onDelete } = data;
  const config = NODE_TYPE_MAP[type];
  const nodeLabel = config?.label || type;
  const handles = TYPED_HANDLES[type] || [];
  const outputHandles = OUTPUT_HANDLES[type] || [];

  return (
    <div
      className="group relative bg-white rounded-lg transition-shadow hover:shadow-md"
      style={{
        width: 180,
        minHeight: 90,
        border: selected ? `2px solid ${color}` : `1px solid #e5e7eb`,
        boxShadow: selected ? `0 0 0 2px ${color}40` : undefined,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 8,
        position: 'relative',
      }}
    >
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold leading-none"
          title="Delete node"
        >{'\u00D7'}</button>
      )}

      {/* Multiple typed input handles */}
      {handles.map((h) => (
        <div key={h.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={h.id}
            style={{
              top: h.top,
              background: h.color,
              width: 10,
              height: 10,
              border: '2px solid white',
            }}
          />
          <span
            className="text-[8px] font-medium pointer-events-none select-none"
            style={{
              position: 'absolute',
              left: 6,
              top: h.top,
              transform: 'translateY(-50%)',
              color: h.color,
              whiteSpace: 'nowrap',
            }}
          >
            {h.label}
          </span>
        </div>
      ))}

      <IconBadge color={color} type={type} />
      <div className="flex flex-col overflow-hidden min-w-0">
        <span className="text-xs text-gray-800 font-medium truncate">{title || 'Untitled'}</span>
        <span className="text-[9px] text-gray-400 truncate">{nodeLabel}</span>
      </div>

      {/* Typed output handles (if defined) */}
      {outputHandles.length > 0 ? outputHandles.map((h) => (
        <div key={h.id}>
          <Handle
            type="source"
            position={Position.Right}
            id={h.id}
            style={{
              top: h.top,
              background: h.color,
              width: 10,
              height: 10,
              border: '2px solid white',
            }}
          />
          <span
            className="text-[8px] font-medium pointer-events-none select-none"
            style={{
              position: 'absolute',
              right: 6,
              top: h.top,
              transform: 'translateY(-50%)',
              color: h.color,
              whiteSpace: 'nowrap',
            }}
          >
            {h.label}
          </span>
        </div>
      )) : (
        /* Single output handle (default) */
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="!bg-gray-400 !w-3 !h-3 !border-2 !border-gray-300"
        />
      )}
    </div>
  );
}

/* --- AiNode --- special compact card with pulse ring --- */
function AiNode({ id, data, selected }: { id: string; data: GraphNodeData; selected?: boolean }) {
  const { color, onDelete, handleSide } = data;
  const posMap = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right } as const;
  const model = (data.model as string) || AI_NODE_CONFIG.defaultModel;
  const hasApiKey = !!(data.apiKey as string);
  const modelInfo = AI_NODE_CONFIG.availableModels.find(m => m.id === model);
  const shortLabel = modelInfo?.label || model;

  return (
    <div
      className="group relative bg-white rounded-lg transition-shadow hover:shadow-md"
      style={{
        width: 190,
        height: 56,
        border: selected ? `2px solid ${color}` : `1px solid ${color}60`,
        boxShadow: selected ? `0 0 0 2px ${color}40` : undefined,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 8,
        position: 'relative',
      }}
    >
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold leading-none"
          title="Delete node"
        >{'\u00D7'}</button>
      )}
      {!handleSide && <Handle type="target" position={Position.Left} className="!bg-indigo-400 !w-3 !h-3 !border-2 !border-indigo-200" />}

      <div className="relative shrink-0">
        {hasApiKey && (
          <div
            className="absolute inset-0 rounded"
            style={{
              width: 36,
              height: 36,
              border: `2px solid ${color}`,
              borderRadius: 6,
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
        )}
        <IconBadge color={color} type="aiNode" />
      </div>
      <div className="flex flex-col overflow-hidden min-w-0">
        <span className="text-xs text-gray-800 font-semibold truncate">{shortLabel}</span>
        <span className="text-[9px] text-indigo-400 truncate">AI Agent</span>
      </div>

      <Handle
        type="source"
        position={handleSide ? (posMap[handleSide as keyof typeof posMap] ?? Position.Top) : Position.Right}
        className="!bg-indigo-400 !w-3 !h-3 !border-2 !border-indigo-200"
      />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

/* --- DefaultGraphNode --- compact card (180x50) --- */
function DefaultGraphNode({ id, data, selected }: { id: string; data: GraphNodeData; selected?: boolean }) {
  const { type, color, title, onDelete } = data;
  const config = NODE_TYPE_MAP[type];
  const nodeLabel = config?.label || type;

  return (
    <div
      className="group relative bg-white rounded-lg transition-shadow hover:shadow-md"
      style={{
        width: 180,
        height: 50,
        border: selected ? `2px solid ${color}` : `1px solid #e5e7eb`,
        boxShadow: selected ? `0 0 0 2px ${color}40` : undefined,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 8,
      }}
    >
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold leading-none"
          title="Delete node"
        >{'\u00D7'}</button>
      )}
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-3 !h-3 !border-2 !border-gray-300" />

      <IconBadge color={color} type={type} />
      <div className="flex flex-col overflow-hidden min-w-0">
        <span className="text-xs text-gray-800 font-medium truncate">{title || 'Untitled'}</span>
        <span className="text-[9px] text-gray-400 truncate">{nodeLabel}</span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-3 !h-3 !border-2 !border-gray-300" />
    </div>
  );
}

/* --- IdeasProxyNode --- user-curated ideas from Ideas Cloud --- */
function IdeasProxyNode({ id, data, selected }: { id: string; data: GraphNodeData; selected?: boolean }) {
  const { color, onDelete, onContentChange, handleSide } = data;
  const posMap = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right } as const;
  const [allIdeas, setAllIdeas] = useState<Array<{ id: string; text: string; weight: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  // selected IDs stored in data.content as JSON
  const selectedIds: string[] = (() => {
    try { return JSON.parse((data.content as string) || '[]'); } catch { return []; }
  })();

  useEffect(() => {
    fetch('/api/v1/ideas')
      .then(r => r.json())
      .then(d => setAllIdeas(d.ideas || []))
      .catch(() => setAllIdeas([]))
      .finally(() => setLoading(false));
  }, []);

  const toggle = useCallback((ideaId: string) => {
    const next = selectedIds.includes(ideaId)
      ? selectedIds.filter(x => x !== ideaId)
      : [...selectedIds, ideaId];
    if (onContentChange) onContentChange(id, JSON.stringify(next));
  }, [id, selectedIds, onContentChange]);

  const shown = selectedIds.length > 0
    ? allIdeas.filter(i => selectedIds.includes(i.id))
    : [];

  return (
    <div
      className="group relative bg-white rounded-xl shadow-sm"
      style={{
        width: 220,
        border: selected ? `2px solid ${color}` : `1.5px solid ${color}60`,
        boxShadow: selected ? `0 0 0 3px ${color}22` : undefined,
        overflow: 'visible',
      }}
    >
      {/* Delete — outside overflow context */}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -top-2 -right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold"
        >×</button>
      )}
      {/* No target handle in chapter canvas mode (handleSide set) */}
      {!handleSide && <Handle type="target" position={Position.Left} className="!bg-yellow-400 !w-2.5 !h-2.5 !border-2 !border-yellow-200" />}

      {/* Header */}
      <div
        className="nodrag nopan flex items-center justify-between px-2.5 py-1.5 rounded-t-xl border-b border-gray-100 cursor-pointer select-none"
        style={{ background: `${color}18` }}
        onClick={() => setPicking(p => !p)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm">💡</span>
          <span className="text-[11px] font-semibold text-gray-700">Ideas Cloud</span>
        </div>
        <span className="text-[10px] text-gray-400">{picking ? '▲' : '▼'} {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'pick'}</span>
      </div>

      {/* Picker (expanded) */}
      {picking && (
        <div className="nodrag nopan border-b border-gray-100 max-h-40 overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
          {loading ? (
            <div className="px-2 py-2 text-[10px] text-gray-400">Loading...</div>
          ) : allIdeas.length === 0 ? (
            <div className="px-2 py-2 text-[10px] text-gray-400">No ideas yet</div>
          ) : allIdeas.map(idea => (
            <label
              key={idea.id}
              className="flex items-center gap-1.5 px-2 py-1 hover:bg-yellow-50 cursor-pointer"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(idea.id)}
                onChange={() => toggle(idea.id)}
                onMouseDown={(e) => e.stopPropagation()}
                className="nodrag nopan w-3 h-3 accent-yellow-500"
              />
              <span className="text-[10px] text-gray-700 truncate leading-tight">{idea.text}</span>
            </label>
          ))}
        </div>
      )}

      {/* Selected ideas display */}
      {shown.length > 0 && (
        <div className="px-2 py-1.5 space-y-0.5" style={{ borderRadius: '0 0 10px 10px', background: '#fffdf0' }}>
          {shown.map(idea => (
            <div key={idea.id} className="flex items-center gap-1.5">
              <span className="shrink-0 rounded text-white text-[8px] font-bold px-1" style={{ background: color, minWidth: 28, textAlign: 'center' }}>
                {Math.round(idea.weight * 100)}%
              </span>
              <span className="text-[10px] text-gray-700 truncate leading-tight">{idea.text}</span>
            </div>
          ))}
        </div>
      )}

      {shown.length === 0 && !picking && (
        <div className="px-2.5 py-2 text-[10px] text-gray-400 italic">Click header to select ideas</div>
      )}

      <Handle
        type="source"
        position={handleSide ? (posMap[handleSide as keyof typeof posMap] ?? Position.Top) : Position.Right}
        className="!bg-yellow-400 !w-2.5 !h-2.5 !border-2 !border-yellow-200"
      />
    </div>
  );
}

/* --- Set of types that use hub layout (4-directional) --- */
const HUB_HANDLE_TYPES = new Set(Object.keys(HUB_HANDLES));

/* --- Set of types that use typed multi-handles --- */
const TYPED_HANDLE_TYPES = new Set(Object.keys(TYPED_HANDLES));

/* --- Main GraphNode router --- */
function GraphNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as unknown as GraphNodeData;

  if (d.type === 'ideasProxy') return <IdeasProxyNode id={id} data={d} selected={selected} />;
  if (d.isProxy) return <ProxyNode id={id} data={d} selected={selected} />;
  if (d.type === 'state') return <StateNode id={id} data={d} />;
  if (d.type === 'aiNode') return <AiNode id={id} data={d} selected={selected} />;
  if (REFERENCE_TYPES.has(d.type)) return <ReferenceNode id={id} data={d} selected={selected} />;
  if (HUB_HANDLE_TYPES.has(d.type)) return <HubNode id={id} data={d} selected={selected} />;
  if (TYPED_HANDLE_TYPES.has(d.type)) return <TypedHandleNode id={id} data={d} selected={selected} />;
  return <DefaultGraphNode id={id} data={d} selected={selected} />;
}

export default memo(GraphNodeComponent);
