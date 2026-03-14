'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChatPanel, { type ChatMessage } from './ChatPanel';
import CloudPreviewPanel from './CloudPreviewPanel';
import {
  parseAllMessages,
  extractProjectTitle,
  isCompletionSignal,
  type ParsedCloudItem,
} from './CloudParser';

const LS_KEY_MESSAGES = 'cc_chat_messages';
const LS_KEY_TITLE = 'cc_chat_title';
const LS_KEY_ITEMS = 'cc_chat_items';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [cloudItems, setCloudItems] = useState<ParsedCloudItem[]>([]);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [lsLoaded, setLsLoaded] = useState(false); // prevents empty-state flash on remount

  // Keep a ref to latest messages for the streaming callback
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // Warm the DB on mount so first chat send doesn't cold-start Neon
  useEffect(() => {
    fetch('/api/v1/ping').catch(() => { /* silent — just warming */ });
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY_MESSAGES);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (parsed.length > 0) {
          setMessages(parsed);
          // Re-parse cloud items from restored messages
          const items = parseAllMessages(parsed);
          setCloudItems(items);
          // Re-extract title
          for (let i = parsed.length - 1; i >= 0; i--) {
            if (parsed[i].role === 'assistant') {
              const title = extractProjectTitle(parsed[i].content);
              if (title) { setProjectTitle(title); break; }
            }
          }
        }
      }
      const storedTitle = localStorage.getItem(LS_KEY_TITLE);
      if (storedTitle) setProjectTitle(storedTitle);
    } catch { /* ignore corrupt localStorage */ }
    setLsLoaded(true);
  }, []);

  // Persist messages to localStorage on change + on unmount (prevents navigation race condition)
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(LS_KEY_MESSAGES, JSON.stringify(messages));
    }
  }, [messages]);

  // Guarantee save on unmount — messagesRef holds latest value even mid-render
  useEffect(() => {
    return () => {
      if (messagesRef.current.length > 0) {
        localStorage.setItem(LS_KEY_MESSAGES, JSON.stringify(messagesRef.current));
      }
    };
  }, []);

  // Persist projectTitle
  useEffect(() => {
    if (projectTitle) localStorage.setItem(LS_KEY_TITLE, projectTitle);
  }, [projectTitle]);

  const handleNewProject = useCallback(() => {
    localStorage.removeItem(LS_KEY_MESSAGES);
    localStorage.removeItem(LS_KEY_TITLE);
    localStorage.removeItem(LS_KEY_ITEMS);
    setMessages([]);
    setCloudItems([]);
    setProjectTitle(null);
    setIsComplete(false);
  }, []);

  const updateCloudFromMessages = useCallback((allMsgs: ChatMessage[]) => {
    const items = parseAllMessages(allMsgs);
    setCloudItems(items);

    // Extract title from latest assistant message
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      if (allMsgs[i].role === 'assistant') {
        const title = extractProjectTitle(allMsgs[i].content);
        if (title) { setProjectTitle(title); break; }
      }
    }

    // Check completion
    const lastAssistant = allMsgs.filter(m => m.role === 'assistant').pop();
    if (lastAssistant && isCompletionSignal(lastAssistant.content)) {
      setIsComplete(true);
    }
  }, []);

  const handleSend = useCallback(async (text: string, attachments?: { name: string; content: string }[]) => {
    // Append file contents to the message
    let fullText = text;
    if (attachments?.length) {
      const fileBlock = attachments
        .map(a => `\n\n[Attached file: ${a.name}]\n${a.content}`)
        .join('\n');
      fullText = text + fileBlock;
    }

    const userMsg: ChatMessage = {
      role: 'user',
      content: text + (attachments?.length ? `\n\n📎 ${attachments.map(a => a.name).join(', ')}` : ''),
    };
    const msgForApi: ChatMessage = { role: 'user', content: fullText };
    const updatedMessages = [...messagesRef.current, userMsg];
    const apiMessages = [...messagesRef.current, msgForApi];
    messagesRef.current = updatedMessages; // sync ref immediately (before re-render)
    localStorage.setItem(LS_KEY_MESSAGES, JSON.stringify(updatedMessages)); // eager save
    setMessages(updatedMessages);
    setStreaming(true);
    setStreamingText('');

    // Helper: attempt a single chat fetch, returns Response or throws
    const attemptFetch = () => fetch('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages }),
    });

    try {
      let res = await attemptFetch();

      // Auto-retry once on cold-start failures (5xx / network) — but not on auth/billing errors
      if (!res.ok && res.status >= 500) {
        await new Promise(r => setTimeout(r, 2000));
        res = await attemptFetch();
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errMsg: ChatMessage = {
          role: 'assistant',
          content: err.code === 'BYOT_REQUIRED'
            ? 'Please add your Google AI API key in Settings to use the chat feature.'
            : `Error: ${err.error || 'Something went wrong'}`,
        };
        setMessages(prev => [...prev, errMsg]);
        setStreaming(false);
        return;
      }

      // Read streaming response
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingText(fullText);

        // Live-parse cloud items during streaming
        const tempMessages = [...updatedMessages, { role: 'assistant' as const, content: fullText }];
        const items = parseAllMessages(tempMessages);
        setCloudItems(items);

        // Live title extraction
        const title = extractProjectTitle(fullText);
        if (title) setProjectTitle(title);
      }

      // Finalize
      const assistantMsg: ChatMessage = { role: 'assistant', content: fullText };
      const finalMessages = [...updatedMessages, assistantMsg];
      messagesRef.current = finalMessages; // sync ref
      localStorage.setItem(LS_KEY_MESSAGES, JSON.stringify(finalMessages)); // eager save
      setMessages(finalMessages);
      setStreamingText('');
      updateCloudFromMessages(finalMessages);
    } catch (err) {
      // Network-level error (e.g. function cold start dropped connection) — retry once silently
      try {
        await new Promise(r => setTimeout(r, 2000));
        const retryRes = await attemptFetch();
        if (retryRes.ok) {
          const reader = retryRes.body!.getReader();
          const decoder = new TextDecoder();
          let retryText = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            retryText += chunk;
            setStreamingText(retryText);
            const tempMessages = [...updatedMessages, { role: 'assistant' as const, content: retryText }];
            setCloudItems(parseAllMessages(tempMessages));
            const title = extractProjectTitle(retryText);
            if (title) setProjectTitle(title);
          }
          const assistantMsg: ChatMessage = { role: 'assistant', content: retryText };
          const finalMessages = [...updatedMessages, assistantMsg];
          setMessages(finalMessages);
          setStreamingText('');
          updateCloudFromMessages(finalMessages);
          return;
        }
      } catch {
        // retry also failed — fall through to error message
      }
      console.error('Chat error:', err);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Connection error. Please try again.' },
      ]);
    } finally {
      setStreaming(false);
    }
  }, [updateCloudFromMessages]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        {/* New project button */}
        {messages.length > 0 && (
          <div className="px-4 py-1 border-b border-border bg-white flex justify-end">
            <button
              onClick={handleNewProject}
              className="text-xs text-muted hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-gray-100"
            >
              New project
            </button>
          </div>
        )}
        {/* Split panel: chat left, cloud right */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Chat */}
          <div className="flex-1 flex flex-col border-r border-border min-h-0 md:max-w-[50%]">
            <ChatPanel
              messages={messages}
              streaming={streaming}
              streamingText={streamingText}
              onSend={handleSend}
              loading={!lsLoaded}
            />
          </div>

          {/* Right: Cloud preview */}
          <div className="flex-1 flex flex-col min-h-0 md:max-w-[50%] bg-gray-50/50">
            <CloudPreviewPanel
              items={cloudItems}
              projectTitle={projectTitle}
              isComplete={isComplete}
              onSaved={() => {
                localStorage.removeItem(LS_KEY_MESSAGES);
                localStorage.removeItem(LS_KEY_TITLE);
                localStorage.removeItem(LS_KEY_ITEMS);
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
