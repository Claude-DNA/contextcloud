'use client';

import { tr } from '@/i18n/client';
/**
 * Step-by-step help for getting an API key from each provider, in plain words.
 * Shown under the key field in Settings, open when no key is saved yet.
 */

export type GuideProvider = 'google' | 'anthropic' | 'openai' | 'openrouter';

interface Guide {
  /** One line: what this choice is like. */
  summary: string;
  cost: string;
  steps: { text: string; link?: { href: string; label: string } }[];
  /** Something the writer should know before choosing it. */
  watch?: string;
  /** Extra line for the Illustrations section. */
  pictures?: string;
}

export const GUIDES: Record<GuideProvider, Guide> = {
  google: {
    summary: 'The easiest place to start. You only need a Google account, the same one you use for Gmail or YouTube.',
    cost: 'Free to start. There is a daily limit; if you reach it, wait until tomorrow or add a card in Google to keep going.',
    steps: [
      { text: 'Open Google AI Studio and sign in with your Google account.', link: { href: 'https://aistudio.google.com/app/apikey', label: 'Open Google AI Studio' } },
      { text: 'If it asks, pick your country and agree to the terms.' },
      { text: 'Click "Create API key". If it asks which project, take the one it offers.' },
      { text: 'A long code starting with AIza appears. Click the copy button next to it.' },
      { text: 'Come back here, paste it into the box above and click "Save key".' },
    ],
    watch: 'On the free plan Google may read what you send to improve its AI. If your story is private, add a card in Google AI Studio to switch to the paid plan, where it does not.',
    pictures: 'The same key can draw pictures too.',
  },
  anthropic: {
    summary: 'Claude is very good at careful writing and long stories. It needs a small payment first.',
    cost: 'You buy credit first, like topping up a phone. A few dollars lasts a long time for writing. When the credit runs out, AI stops until you add more.',
    steps: [
      { text: 'Open the Claude Console and make an account, or sign in.', link: { href: 'https://platform.claude.com/settings/billing', label: 'Open Claude billing' } },
      { text: 'On the Billing page, click "Buy credits", choose a small amount (5 or 10 dollars is plenty to try) and pay with a card.' },
      { text: 'Go to "API keys" and click "Create key". Give it a name you will recognise, like "Studio".', link: { href: 'https://platform.claude.com/settings/keys', label: 'Open Claude API keys' } },
      { text: 'Copy the key straight away. It starts with sk-ant- and you will only see it once.' },
      { text: 'Come back here, paste it into the box above and click "Save key".' },
    ],
    watch: 'A Claude.ai subscription (Pro or Max) is a different thing and does not give you an API key. The credit here is separate.',
    pictures: 'Claude cannot draw pictures. For pictures, choose another provider below.',
  },
  openai: {
    summary: 'The company behind ChatGPT. Good at writing, and it can also draw pictures.',
    cost: 'You buy credit first; the smallest top-up is 5 dollars. Credit you do not use runs out after a year.',
    steps: [
      { text: 'Open the OpenAI Platform and make an account, or sign in. Your ChatGPT login works.', link: { href: 'https://platform.openai.com/settings/organization/billing/overview', label: 'Open OpenAI billing' } },
      { text: 'On the Billing page, click "Add payment details", add a card and choose how much credit to buy.' },
      { text: 'Before you confirm, switch off "auto-reload" unless you want it to buy more credit by itself.' },
      { text: 'Go to "API keys" and click "Create new secret key". Name it "Studio".', link: { href: 'https://platform.openai.com/api-keys', label: 'Open OpenAI API keys' } },
      { text: 'Copy the key straight away. It starts with sk- and you will only see it once.' },
      { text: 'Come back here, paste it into the box above, click "Save key", then pick a model below.' },
    ],
    watch: 'A ChatGPT subscription (Plus or Pro) is a different thing and does not give you an API key. OpenAI needs a normal bank card in your name.',
    pictures: 'The same key draws pictures with GPT Image models.',
  },
  openrouter: {
    summary: 'One key that opens hundreds of AI models from many companies, so you can try them all from one place.',
    cost: 'You buy credit first and each model costs a different amount; the list below shows the price of each. A few models are free but limited to a small number of uses a day.',
    steps: [
      { text: 'Open OpenRouter and sign up with Google, GitHub or your email.', link: { href: 'https://openrouter.ai/settings/credits', label: 'Open OpenRouter credits' } },
      { text: 'On the Credits page, buy a small amount of credit (5 or 10 dollars).' },
      { text: 'Go to "Keys" and click "Create key". Name it "Studio".', link: { href: 'https://openrouter.ai/settings/keys', label: 'Open OpenRouter keys' } },
      { text: 'Copy the key straight away. It starts with sk-or- and you will only see it once.' },
      { text: 'Come back here, paste it into the box above, click "Save key", then pick a model below. The price is shown next to each one.' },
    ],
    pictures: 'The same key can use the picture models OpenRouter offers.',
  },
};

/** What an API key is, for someone who has never used one. */
export function KeyExplainer() {
  return (
    <details className="rounded-lg border border-border bg-gray-50 px-4 py-3 text-sm text-foreground">
      <summary className="cursor-pointer font-medium">{tr("What is an API key, and why do I need one?")}</summary>
      <div className="mt-2 space-y-2 text-muted leading-relaxed">
        <p>{tr("Studio does not have its own AI. It borrows one from an AI company, like Google or OpenAI.")}</p>
        <p>{tr("An API key is like a library card for that company: a long secret code that tells them the request is from you. You get it from their website, paste it here once, and Studio uses it whenever you press an AI button.")}</p>
        <p>{tr("You pay the AI company for what you use, not Studio. Studio keeps your key locked (encrypted) and never shows it again in full.")}</p>
        <p>{tr("Treat the key like a password: do not post it or send it to anyone. If it ever leaks, delete it on the company's website and make a new one.")}</p>
        <p>{tr("Not sure which to pick? Start with Google Gemini: it is free to try.")}</p>
      </div>
    </details>
  );
}

export default function ProviderGuide({ provider, label, open, forPictures = false }: { provider: GuideProvider; label: string; open: boolean; forPictures?: boolean }) {
  const g = GUIDES[provider];
  return (
    <details open={open} className="rounded-lg border border-border px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">{tr("How to get your {label} key", { label })}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-foreground">{tr(g.summary)}</p>
        <p className="text-muted"><span className="font-medium text-foreground">{tr("Cost:")}{" "}</span>{tr(g.cost)}</p>
        {forPictures && g.pictures && <p className="text-muted">{tr(g.pictures)}</p>}
        <ol className="list-decimal space-y-2 pl-5 text-foreground marker:text-muted">
          {g.steps.map((s, i) => (
            <li key={i} className="leading-relaxed">
              {tr(s.text)}{' '}
              {s.link && (
                <a href={s.link.href} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-accent hover:underline">
                  {tr(s.link.label)} <span aria-hidden="true">↗</span><span className="sr-only">{tr("(opens in a new tab)")}</span>
                </a>
              )}
            </li>
          ))}
        </ol>
        {g.watch && <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900"><span className="font-medium">{tr("Good to know:")}{" "}</span>{tr(g.watch)}</p>}
      </div>
    </details>
  );
}
