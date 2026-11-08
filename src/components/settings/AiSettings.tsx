'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ProviderId = 'google' | 'anthropic' | 'openai' | 'openrouter';
interface ProviderInfo { id: ProviderId; label: string; keyUrl: string; keyHint: string }
interface Settings {
  provider: ProviderId;
  model: string | null;
  light_model: string | null;
  keys: Record<ProviderId, string | null>;
  server_keys: ProviderId[];
  providers: ProviderInfo[];
}
interface Model { id: string; name: string; inputPrice?: number; outputPrice?: number; context?: number }

const BLURB: Record<ProviderId, string> = {
  google: 'Gemini models. Google AI Studio has a free tier for trying things out.',
  anthropic: 'Claude models. Haiku is the low-cost choice; Sonnet and Opus write better.',
  openai: 'GPT models from OpenAI.',
  openrouter: 'One key for hundreds of models from many labs (DeepSeek, Mistral, Llama, Qwen and others), with prices shown.',
};

const price = (m: Model) =>
  m.inputPrice !== undefined && m.outputPrice !== undefined
    ? ` · $${m.inputPrice < 1 ? m.inputPrice.toFixed(2) : m.inputPrice.toFixed(1)} in / $${m.outputPrice < 1 ? m.outputPrice.toFixed(2) : m.outputPrice.toFixed(1)} out per 1M tokens`
    : '';

/** Settings section: AI provider, key, models, and a connection test. */
export default function AiSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/v1/user/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Could not save');
    setS(d);
    return d as Settings;
  }, []);

  const loadModels = useCallback(async (settings: Settings) => {
    const p = settings.provider;
    setModels([]);
    setModelsError(null);
    setFilter('');
    if (p !== 'openrouter' && !settings.keys[p] && !settings.server_keys.includes(p)) return;
    setLoadingModels(true);
    try {
      const res = await fetch(`/api/v1/user/models?provider=${p}`);
      const d = await res.json();
      if (!res.ok) { setModelsError(d.error || 'Could not load models.'); return; }
      setModels(d.models ?? []);
      // First time with this provider: pick the recommended models so it works straight away.
      const hasKey = Boolean(settings.keys[p] || settings.server_keys.includes(p));
      if (hasKey && !settings.model && d.recommended?.model) {
        await save({ model: d.recommended.model, light_model: d.recommended.light ?? d.recommended.model });
      }
    } catch {
      setModelsError('Could not load models.');
    } finally {
      setLoadingModels(false);
    }
  }, [save]);

  useEffect(() => {
    fetch('/api/v1/user/settings').then((r) => r.json()).then((d: Settings) => { setS(d); loadModels(d); });
  }, [loadModels]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? models.filter((m) => m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f)) : models;
  }, [models, filter]);

  if (!s) {
    return (
      <section className="border border-border rounded-xl p-6 bg-card-bg">
        <p className="text-sm text-muted">Loading AI settings…</p>
      </section>
    );
  }

  const info = s.providers.find((p) => p.id === s.provider)!;
  const ownKey = s.keys[s.provider];
  const serverKey = s.server_keys.includes(s.provider);
  const hasKey = Boolean(ownKey || serverKey);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      if (done) setStatus({ ok: true, text: done });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const chooseProvider = (p: ProviderId) =>
    run(async () => { const d = await save({ provider: p }); await loadModels(d); });
  const saveKey = () =>
    run(async () => { const d = await save({ key: { provider: s.provider, value: keyInput.trim() } }); setKeyInput(''); await loadModels(d); }, 'Key saved.');
  const removeKey = () =>
    run(async () => { const d = await save({ key: { provider: s.provider, value: '' } }); await loadModels(d); }, 'Key removed.');
  const test = () =>
    run(async () => {
      const res = await fetch('/api/v1/user/test-ai', { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.message || d.error || 'The test failed.');
      setStatus({ ok: true, text: `Working: ${d.model}${d.light_model && d.light_model !== d.model ? ` and ${d.light_model}` : ''} answered.` });
    });

  const options = (current: string | null) => (
    <>
      {current && !shown.some((m) => m.id === current) && <option value={current}>{current}</option>}
      {shown.map((m) => (
        <option key={m.id} value={m.id}>{(m.name === m.id ? m.id : `${m.name} (${m.id})`) + price(m)}</option>
      ))}
    </>
  );

  return (
    <section className="border border-border rounded-xl p-6 bg-card-bg space-y-6" aria-labelledby="ai-settings-title">
      <div>
        <h2 id="ai-settings-title" className="text-base font-semibold text-foreground">AI model</h2>
        <p className="text-sm text-muted mt-1">
          Extraction, chat, graph building and flow drafts run on your own API key, with the provider and model you choose here.
          You pay the provider directly; keys are stored encrypted and never shown again in full.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground mb-2">Provider</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {s.providers.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                p.id === s.provider ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input type="radio" name="ai-provider" className="accent-[var(--color-accent,#6366f1)]" checked={p.id === s.provider} disabled={busy} onChange={() => chooseProvider(p.id)} />
                {p.label}
                {s.keys[p.id] && <span className="text-xs font-normal text-emerald-700">key saved</span>}
              </span>
              <span className="mt-1 pl-5 text-xs text-muted leading-relaxed">{BLURB[p.id]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="ai-key" className="text-sm font-medium text-foreground block">{info.label} API key</label>
        {ownKey ? (
          <p className="text-sm text-muted">
            Saved: <span className="font-mono text-foreground">{ownKey}</span>{' '}
            <button type="button" onClick={removeKey} disabled={busy} className="ml-2 text-xs text-red-600 hover:text-red-700 disabled:opacity-50">Remove key</button>
          </p>
        ) : serverKey ? (
          <p className="text-sm text-muted">Using the server key for your admin account. Add your own to use it instead.</p>
        ) : (
          <p className="text-sm text-amber-700">No key for {info.label} yet: AI features are off until you add one.</p>
        )}
        <div className="flex gap-2">
          <input
            id="ai-key"
            type="password"
            autoComplete="off"
            placeholder={ownKey ? 'Paste a new key to replace it' : info.keyHint}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && keyInput.trim() && saveKey()}
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button type="button" onClick={saveKey} disabled={busy || !keyInput.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors">
            Save key
          </button>
        </div>
        <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">Get an API key from {info.label}</a>
      </div>

      {hasKey || s.provider === 'openrouter' ? (
        <div className="space-y-3">
          {loadingModels ? (
            <p className="text-sm text-muted">Loading {info.label} models…</p>
          ) : modelsError ? (
            <p className="text-sm text-red-600">{modelsError}</p>
          ) : (
            <>
              {models.length > 30 && (
                <div>
                  <label htmlFor="ai-filter" className="text-xs text-muted block mb-1">Filter {models.length} models</label>
                  <input id="ai-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g. deepseek, haiku, mini"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              )}
              <div>
                <label htmlFor="ai-model" className="text-sm font-medium text-foreground block mb-1">Main model</label>
                <p id="ai-model-hint" className="text-xs text-muted mb-1.5">Reads your texts, builds graphs, drafts flows and chats.</p>
                <select id="ai-model" aria-describedby="ai-model-hint" value={s.model ?? ''} disabled={busy || !hasKey}
                  onChange={(e) => run(() => save({ model: e.target.value }), 'Main model saved.')}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-accent">
                  {!s.model && <option value="">Choose a model</option>}
                  {options(s.model)}
                </select>
              </div>
              <div>
                <label htmlFor="ai-light" className="text-sm font-medium text-foreground block mb-1">Light model</label>
                <p id="ai-light-hint" className="text-xs text-muted mb-1.5">For small jobs: tags, scores and weights. A cheaper model is fine here.</p>
                <select id="ai-light" aria-describedby="ai-light-hint" value={s.light_model && s.light_model !== s.model ? s.light_model : ''} disabled={busy || !hasKey}
                  onChange={(e) => run(() => save({ light_model: e.target.value || null }), 'Light model saved.')}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-accent">
                  <option value="">Same as the main model</option>
                  {options(s.light_model && s.light_model !== s.model ? s.light_model : null)}
                </select>
              </div>
              {!hasKey && <p className="text-sm text-muted">Add an OpenRouter key to choose and use a model.</p>}
            </>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={test} disabled={busy || !hasKey || !s.model}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {busy ? 'Working…' : 'Test connection'}
            </button>
          </div>
        </div>
      ) : null}

      {status && (
        <p role="status" className={`text-sm ${status.ok ? 'text-emerald-700' : 'text-red-600'}`}>{status.text}</p>
      )}
    </section>
  );
}
