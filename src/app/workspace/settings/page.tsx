'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/user/settings')
      .then(r => r.json())
      .then(d => {
        setHasKey(d.hasKey);
        setKeyPreview(d.keyPreview);
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch('/api/v1/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleAiKey: keyInput }),
    });
    const d = await res.json();
    setHasKey(d.hasKey);
    if (d.hasKey) setKeyPreview('••••••••' + keyInput.slice(-4));
    setKeyInput('');
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function remove() {
    setSaving(true);
    await fetch('/api/v1/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleAiKey: '' }),
    });
    setHasKey(false);
    setKeyPreview(null);
    setKeyInput('');
    setSaving(false);
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted mb-8">Configure your workspace preferences.</p>

      <div className="border border-border rounded-xl p-6 bg-card-bg space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Google AI API Key</h2>
          <p className="text-sm text-muted mt-1">
            Required for AI features — tag generation, document import, plot generation, and more.
            Get a free key at{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 hover:underline"
            >
              aistudio.google.com
            </a>
            .
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : hasKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-gray-600 flex-1">
                {keyPreview}
              </span>
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                ✓ Active
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enter new key to replace…"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-transparent focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <button
                onClick={save}
                disabled={saving || !keyInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
            <button
              onClick={remove}
              disabled={saving}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Remove key
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span>⚠</span>
              <span>No API key — AI features are disabled until you add one.</span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="AIza…"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && keyInput.trim() && save()}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-transparent focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <button
                onClick={save}
                disabled={saving || !keyInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save key'}
              </button>
            </div>
          </div>
        )}

        {saved && (
          <p className="text-sm text-emerald-600 font-medium">✓ Key saved successfully</p>
        )}
      </div>
    </div>
  );
}
