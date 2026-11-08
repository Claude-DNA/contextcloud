'use client';

import { useCallback, useEffect, useState } from 'react';

type ImageProviderId = 'google' | 'openai' | 'openrouter';
interface Model { id: string; name: string; price?: string }
interface Settings {
  image_provider: ImageProviderId | null;
  image_model: string | null;
  keys: Record<string, string | null>;
  server_keys: string[];
}

const PROVIDERS: { id: ImageProviderId; label: string; blurb: string; keyUrl: string; keyHint: string }[] = [
  { id: 'google', label: 'Google Gemini', blurb: 'Gemini image models. Keeps characters consistent by reusing their portraits.', keyUrl: 'https://aistudio.google.com/app/apikey', keyHint: 'AIza…' },
  { id: 'openai', label: 'OpenAI', blurb: 'GPT Image models.', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…' },
  { id: 'openrouter', label: 'OpenRouter', blurb: 'Many image models with one key, prices shown.', keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-…' },
];

/** Settings section: which provider and model draw the illustrations (uses the same saved keys). */
export default function ImageSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/v1/user/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Could not save');
    setS(d);
    return d as Settings;
  }, []);

  const loadModels = useCallback(async (d: Settings) => {
    setModels([]);
    setModelsError(null);
    const p = d.image_provider;
    if (!p || (p !== 'openrouter' && !d.keys[p] && !d.server_keys.includes(p))) return;
    const res = await fetch(`/api/v1/user/image-models?provider=${p}`);
    const m = await res.json();
    if (!res.ok) { setModelsError(m.error || 'Could not load models.'); return; }
    setModels(m.models ?? []);
    if (!d.image_model && m.recommended) await save({ image_model: m.recommended });
  }, [save]);

  useEffect(() => {
    fetch('/api/v1/user/settings').then((r) => r.json()).then((d: Settings) => { setS(d); loadModels(d); });
  }, [loadModels]);

  if (!s) return null;
  const current = s.image_provider ?? 'google';
  const info = PROVIDERS.find((p) => p.id === current)!;
  const hasKey = Boolean(s.keys[current] || s.server_keys.includes(current));

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

  return (
    <section className="border border-border rounded-xl p-6 bg-card-bg space-y-5" aria-labelledby="img-settings-title">
      <div>
        <h2 id="img-settings-title" className="text-base font-semibold text-foreground">Illustrations</h2>
        <p className="text-sm text-muted mt-1">
          Pictures for your clouds. Studio first looks for a public-domain artwork that shows the element; if none fits, this model draws one in your project&apos;s style.
          Anthropic has no image models, so this can be a different provider from your text model.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-foreground mb-2">Provider</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PROVIDERS.map((p) => (
            <label key={p.id}
              className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${p.id === current ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-300'}`}>
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input type="radio" name="image-provider" checked={p.id === current} disabled={busy}
                  onChange={() => run(async () => loadModels(await save({ image_provider: p.id })))} />
                {p.label}
              </span>
              <span className="mt-1 pl-5 text-xs text-muted leading-relaxed">{p.blurb}</span>
              {s.keys[p.id] && <span className="mt-1 pl-5 text-xs text-emerald-700">key saved</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {!hasKey ? (
        <div className="space-y-2">
          <label htmlFor="img-key" className="text-sm font-medium text-foreground block">{info.label} API key</label>
          <div className="flex gap-2">
            <input id="img-key" type="password" autoComplete="off" placeholder={info.keyHint} value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-accent" />
            <button type="button" disabled={busy || !keyInput.trim()}
              onClick={() => run(async () => { const d = await save({ key: { provider: current, value: keyInput.trim() } }); setKeyInput(''); await loadModels(d); }, 'Key saved.')}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50">
              Save key
            </button>
          </div>
          <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">Get an API key from {info.label}</a>
        </div>
      ) : (
        <div>
          <label htmlFor="img-model" className="text-sm font-medium text-foreground block mb-1">Image model</label>
          {modelsError ? (
            <p className="text-sm text-red-600">{modelsError}</p>
          ) : (
            <select id="img-model" value={s.image_model ?? ''} disabled={busy}
              onChange={(e) => run(() => save({ image_model: e.target.value }), 'Image model saved.')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-accent">
              {!s.image_model && <option value="">Choose a model</option>}
              {s.image_model && !models.some((m) => m.id === s.image_model) && <option value={s.image_model}>{s.image_model}</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{(m.name === m.id ? m.id : `${m.name} (${m.id})`) + (m.price ? ` · ${m.price}` : '')}</option>)}
            </select>
          )}
        </div>
      )}

      {status && <p role="status" className={`text-sm ${status.ok ? 'text-emerald-700' : 'text-red-600'}`}>{status.text}</p>}
    </section>
  );
}
