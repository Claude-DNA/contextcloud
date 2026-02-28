'use client';

interface IdeaRowProps {
  idea: any;
  onEdit: () => void;
  onWeightClick: () => void;
  onTransClick: () => void;
  onFSClick: () => void;
  transCount?: number;
}

export default function IdeaRow({
  idea,
  onEdit,
  onWeightClick,
  onTransClick,
  onFSClick,
  transCount = 0,
}: IdeaRowProps) {
  const truncated =
    idea.text && idea.text.length > 80
      ? idea.text.slice(0, 80) + '...'
      : idea.text || '';

  return (
    <div className="group flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border bg-card-bg hover:bg-accent/5 transition-colors">
      <button
        onClick={onEdit}
        className="flex-1 text-left text-sm text-foreground truncate cursor-pointer"
        title={idea.text}
      >
        {truncated || <span className="text-muted italic">Empty idea</span>}
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onWeightClick(); }}
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200 transition-colors"
          title="Edit weight"
        >
          {Number(idea.weight ?? 1).toFixed(1)}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onTransClick(); }}
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200 transition-colors"
          title="Transformations"
        >
          T:{transCount}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onFSClick(); }}
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200 transition-colors"
          title="Final state"
        >
          FS
        </button>
      </div>
    </div>
  );
}
