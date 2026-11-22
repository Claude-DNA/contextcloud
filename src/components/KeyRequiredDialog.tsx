'use client';

import { tr } from '@/i18n/client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * One popup for every Studio feature that needs an AI key. Instead of each page handling the
 * "key required" answer itself, this watches the app's own API calls: when one comes back 402 with
 * code BYOT_REQUIRED (text AI) or IMAGE_KEY_REQUIRED (pictures), it explains what happened and
 * offers a way to Settings. The page's own error handling still runs as before.
 */

type Need = { kind: 'text' | 'image'; feature: string };

/** A friendly name for the feature behind an API path. */
function featureName(path: string): string {
  const rules: [RegExp, string][] = [
    [/\/audition/, 'Audition'],
    [/\/graph-build/, 'Building the story graph'],
    [/\/suggest/, 'AI suggestions'],
    [/\/associations/, 'Suggesting associations'],
    [/\/illustrate|\/images\/generate/, 'Illustrations'],
    [/\/import|\/extract/, 'Turning text into a cloud'],
    [/\/chat/, 'Chat Creator'],
    [/\/flows|\/drafts|\/plots\/.+\/generate/, 'Drafting'],
    [/\/export/, 'Exporting'],
    [/\/narrativelab/, 'Narrative Lab'],
    [/\/ideas/, 'Idea analysis'],
  ];
  return rules.find(([re]) => re.test(path))?.[1] ?? 'This feature';
}

const EVENT = 'studio:key-required';
let patched = false;

/** Wraps window.fetch once, so every Studio API call is watched. */
function watchFetch() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    if (res.status !== 402) return res;
    try {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return res;
      const body = (await res.clone().json().catch(() => null)) as { code?: string } | null;
      const kind = body?.code === 'BYOT_REQUIRED' ? 'text' : body?.code === 'IMAGE_KEY_REQUIRED' ? 'image' : null;
      if (kind) window.dispatchEvent(new CustomEvent<Need>(EVENT, { detail: { kind, feature: featureName(url.pathname) } }));
    } catch {
      // Watching must never break the request itself.
    }
    return res;
  };
}

export default function KeyRequiredDialog() {
  const [need, setNeed] = useState<Need | null>(null);
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const goButton = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    watchFetch();
    const onNeed = (e: Event) => setNeed((e as CustomEvent<Need>).detail);
    window.addEventListener(EVENT, onNeed);
    return () => window.removeEventListener(EVENT, onNeed);
  }, []);

  // In Settings the writer is already where they need to be.
  const show = !!need && !pathname?.startsWith('/workspace/settings');

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (show && !d.open) {
      d.showModal();
      goButton.current?.focus();
    } else if (!show && d.open) d.close();
  }, [show]);

  const image = need?.kind === 'image';
  const close = () => setNeed(null);

  return (
    <dialog
      ref={dialog}
      onClose={close}
      onClick={(e) => { if (e.target === dialog.current) close(); }}
      aria-labelledby="key-required-title"
      aria-describedby="key-required-body"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-white p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      {need && (
        <div className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </span>
            <div className="space-y-1">
              <h2 id="key-required-title" className="text-base font-semibold">
                {image ? tr("Pictures need a picture key") : tr("{feature} needs an AI key", { feature: tr(need.feature) })}
              </h2>
              <p id="key-required-body" className="text-sm leading-relaxed text-muted">
                {image
                  ? tr("Studio draws pictures with an AI company of your choice. Add a key from Google, OpenAI or OpenRouter in Settings, then try again.")
                  : tr("Studio uses an AI from a company you choose, like Google or OpenAI. Add your key and pick a model in Settings, then try again. It takes about five minutes, and Google Gemini is free to start.")}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-gray-50">{tr("Not now")}</button>
            <Link
              ref={goButton}
              href={`/workspace/settings#${image ? 'illustrations' : 'ai-model'}`}
              onClick={close}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >{tr("Go to Settings")}</Link>
          </div>
        </div>
      )}
    </dialog>
  );
}
