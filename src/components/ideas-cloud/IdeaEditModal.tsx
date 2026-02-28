'use client';

import { useState } from 'react';

interface IdeaEditModalProps {
  idea: any;
  onClose: () => void;
  onSave: (updated: any) => void;
  onDelete: (id: string) => void;
}

export default function IdeaEditModal({ idea, onClose, onSave, onDelete }: IdeaEditModalProps) {
  const [text, setText] = useState(idea.text || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    if (!text.trim()) return;
    onSave({ ...idea, text: text.trim() });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(idea.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card-bg rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Edit Idea</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your idea..."
            className="w-full h-64 px-3 py-2 border border-border rounded-xl text-sm text-foreground bg-card-bg resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            autoFocus
          />

          <div className="flex gap-2">
            <button
              disabled
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted cursor-not-allowed opacity-50"
              title="Coming soon"
            >
              Generate Image
            </button>
            <button
              disabled
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted cursor-not-allowed opacity-50"
              title="Coming soon"
            >
              Export as Card
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          {idea.id ? (
            <button
              onClick={handleDelete}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                confirmDelete
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-red-500 hover:bg-red-50'
              }`}
            >
              {confirmDelete ? 'Confirm Delete' : 'Delete'}
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!text.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
