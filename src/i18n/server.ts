import { headers } from 'next/headers';
import { localeFromHost, translate, type Locale } from './core';

/** The language of the current request, from its address. English outside a request. */
export async function requestLocale(): Promise<Locale> {
  try {
    const h = await headers();
    return localeFromHost(h.get('x-forwarded-host') ?? h.get('host'));
  } catch {
    return 'en';
  }
}

/** A translator for server components: const tr = await getTr(). */
export async function getTr() {
  const locale = await requestLocale();
  return (text: string, vars?: Record<string, unknown>) => translate(locale, text, vars);
}
