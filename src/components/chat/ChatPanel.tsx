'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AttachedFile {
  name: string;
  content: string; // text content
}

interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  streamingText: string;
  onSend: (text: string, attachments?: AttachedFile[]) => void;
}

export default function ChatPanel({ messages, streaming, streamingText, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSubmit = () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || streaming) return;
    onSend(text, attachments.length > 0 ? attachments : undefined);
    setInput('');
    setAttachments([]);
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setAttachments(prev => [...prev, { name: file.name, content }]);
      };
      reader.readAsText(file);
    });
    // Reset input so same file can be re-attached
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (name: string) => {
    setAttachments(prev => prev.filter(a => a.name !== name));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-muted text-sm mb-1">Start building your Context Cloud.</p>
            <p className="text-muted text-xs">
              Describe your project idea below — or attach a file with notes, an outline, or existing draft.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-sm'
                  : 'bg-gray-100 text-foreground rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-gray-100 text-foreground px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
              {streamingText || (
                <span className="text-muted animate-pulse">Thinking…</span>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border px-4 py-3 bg-white">

        {/* Attached files */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map(a => (
              <div
                key={a.name}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-xs text-foreground"
              >
                <span className="text-muted">📄</span>
                <span className="max-w-[140px] truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.name)}
                  className="ml-1 text-muted hover:text-red-500 transition-colors"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* File attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            title="Attach a file (text, markdown, notes…)"
            className="shrink-0 p-2 rounded-lg text-muted hover:text-foreground hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            {/* Paperclip icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.json,.csv"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Auto-expanding textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder="Describe your project idea… (Shift+Enter for new line)"
            rows={1}
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors bg-white resize-none overflow-y-auto"
            style={{ minHeight: 40, maxHeight: 240 }}
            disabled={streaming}
          />

          <button
            onClick={handleSubmit}
            disabled={streaming || (!input.trim() && attachments.length === 0)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors shrink-0"
          >
            {streaming ? '…' : 'Send'}
          </button>
        </div>

        <p className="text-muted text-xs mt-1.5 pl-10">
          Shift+Enter for new line · Approve items on the right to save to Cloud
        </p>
      </div>
    </div>
  );
}
