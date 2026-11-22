'use client';

import { createContext, use, useContext } from 'react';
import { translate, type Locale } from './core';

/**
 * The page's language comes from the server (root layout reads the address) through this context.
 * tr() looks it up while rendering; in event handlers and effects, where React context can't be read,
 * it falls back to the language the provider recorded for this browser tab. On the server every call
 * happens during rendering, so concurrent English and Russian requests never mix.
 */
const LocaleContext = createContext<Locale>('en');
let tabLocale: Locale = 'en';

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  if (typeof window !== 'undefined') tabLocale = locale;
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

/** The page's language, for components. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

function currentLocale(): Locale {
  try {
    return use(LocaleContext);
  } catch {
    return tabLocale;
  }
}

/** Interface text in the page's language. Keys are the English originals; {name} placeholders are filled from vars. */
export function tr(text: string | null | undefined, vars?: Record<string, unknown>): string {
  if (!text) return text ?? '';
  return translate(currentLocale(), text, vars);
}

/** A formula such as "(Grief − Hope) × Calm" with its feeling names in the page's language. */
export function trFormula(formula: string | null | undefined): string {
  if (!formula) return formula ?? '';
  const locale = currentLocale();
  return locale === 'en' ? formula : formula.replace(/[A-Z][a-z]+/g, (w) => translate(locale, w));
}

/** The page's language outside components (render code, helpers). */
export function pageLocale(): Locale {
  return currentLocale();
}
