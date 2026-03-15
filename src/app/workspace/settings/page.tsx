'use client';

import { useState, useEffect, useCallback } from 'react';

interface ApiKey {
  id: string;
  label: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export default function SettingsPage() {
  // ── Gemini key ──────────────────────────────────────────────────────────────
  const [keyInput, setKeyInput]   = useState('');
  const [hasKey, setHasKey]       = useState(false);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [loading, setLoading]     = useState(true);

  // ── API keys ────────────────────────────────────────────────────────────────
  const [apiKeys, setApiKeys]             = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading]     = useState(true);
  const [newKeyLabel, setNewKeyLabel]     = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyValue, setNewKeyValue]     = useState<string | null>(null); // shown once
  const [newKeyCopied, setNewKeyCopied]   = useState(false);
  const [revokingId, setRevokingId]       = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/user/settings')
      .then(r => r.json())
      .then(d => { setHasKey(d.hasKey); setKeyPreview(d.keyPreview); setLoading(false); });

    loadApiKeys();
  }, []);

  const loadApiKeys = useCallback(() => {
    setKeysLoading(true);
    fetch('/api/v1/user/api-keys')
      .then(r => r.json())
      .then(d => { setApiKeys(d.keys ?? []); setKeysLoading(false); });
  }, []);

  async function saveGeminiKey() {
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

  async function removeGeminiKey() {
    setSaving(true);
    await fetch('/api/v1/user/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleAiKey: '' }),
    });
    setHasKey(false); setKeyPreview(null); setKeyInput(''); setSaving(false);
  }

  async function generateApiKey() {
    setGeneratingKey(true);
    const res = await fetch('/api/v1/user/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newKeyLabel.trim() || 'Unnamed key' }),
    });
    const d = await res.json();
    if (d.key) {
      setNewKeyValue(d.key);
      setNewKeyLabel('');
      loadApiKeys();
    }
    setGeneratingKey(false);
  }

  async function revokeKey(id: string) {
    setRevokingId(id);
    await fetch(`/api/v1/user/api-keys/${id}`, { method: 'DELETE' });
    setRevokingId(null);
    loadApiKeys();
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setNewKeyCopied(true);
    setTimeout(() => setNewKeyCopied(false), 2000);
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-1">Settings</h1>
        <p className="text-sm text-muted">Configure your workspace preferences.</p>
      </div>

      {/* ── Gemini API Key ─────────────────────────────────────────────────── */}
      <div className="border border-border rounded-xl p-6 bg-card-bg space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Google AI API Key</h2>
          <p className="text-sm text-muted mt-1">
            Required for AI features — extraction, chat, graph build, and more.
            Get a free key at{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
               className="text-cyan-600 hover:underline">aistudio.google.com</a>.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : hasKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-gray-600 flex-1">{keyPreview}</span>
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded px-2 py-1">✓ Active</span>
            </div>
            <div className="flex gap-2">
              <input type="password" placeholder="Enter new key to replace…" value={keyInput} onChange={e => setKeyInput(e.target.value)}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-transparent focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              <button onClick={saveGeminiKey} disabled={saving || !keyInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
            <button onClick={removeGeminiKey} disabled={saving} className="text-xs text-red-500 hover:text-red-700 transition-colors">Remove key</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span>⚠</span><span>No API key — AI features disabled until you add one.</span>
            </div>
            <div className="flex gap-2">
              <input type="password" placeholder="AIza…" value={keyInput} onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && keyInput.trim() && saveGeminiKey()}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-transparent focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              <button onClick={saveGeminiKey} disabled={saving || !keyInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save key'}
              </button>
            </div>
          </div>
        )}
        {saved && <p className="text-sm text-emerald-600 font-medium">✓ Key saved successfully</p>}
      </div>

      {/* ── API Access Keys ────────────────────────────────────────────────── */}
      <div className="border border-border rounded-xl p-6 bg-card-bg space-y-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">API Access Keys</h2>
          <p className="text-sm text-muted mt-1">
            Use these keys to access the Context Cloud API from scripts, agents, or integrations.
            Pass as <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">Authorization: Bearer &lt;key&gt;</code> header.
            Keys are shown once — store them securely.
          </p>
        </div>

        {/* New key revealed */}
        {newKeyValue && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-emerald-800">✓ New key generated — copy it now. You won't see it again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-white border border-emerald-200 rounded-lg px-3 py-2 text-emerald-900 break-all select-all">
                {newKeyValue}
              </code>
              <button onClick={() => copyKey(newKeyValue)}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                {newKeyCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <button onClick={() => setNewKeyValue(null)} className="text-xs text-emerald-700 hover:text-emerald-900 transition-colors">
              I've saved it — dismiss
            </button>
          </div>
        )}

        {/* Generate new key */}
        <div className="flex gap-2">
          <input
            type="text" placeholder="Key label (e.g. Navigator, My Script…)"
            value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateApiKey()}
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button onClick={generateApiKey} disabled={generatingKey}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors whitespace-nowrap">
            {generatingKey ? 'Generating…' : '+ Generate key'}
          </button>
        </div>

        {/* Key list */}
        {keysLoading ? (
          <p className="text-sm text-muted">Loading keys…</p>
        ) : apiKeys.length === 0 ? (
          <p className="text-sm text-muted italic">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {apiKeys.map(k => (
              <div key={k.id} className="flex items-center gap-3 bg-gray-50 border border-border rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{k.label}</span>
                    <code className="text-xs font-mono text-muted bg-gray-100 px-1.5 rounded">{k.key_prefix}</code>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Created {formatDate(k.created_at)} · Last used {formatDate(k.last_used_at)}
                  </div>
                </div>
                <button
                  onClick={() => revokeKey(k.id)}
                  disabled={revokingId === k.id}
                  className="shrink-0 text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
                >
                  {revokingId === k.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted border-t border-border pt-3">
          Maximum 10 active keys. Full API reference: <a href="/docs" className="text-accent hover:underline">/docs</a>
        </p>
      </div>
    </div>
  );
}
