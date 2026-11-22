/**
 * Studio speaks English at contextcloud.studio and Russian at ru.contextcloud.studio.
 * One app serves both: the address decides the language, and the interface text is looked up in a
 * dictionary keyed by the English original, so anything not yet translated still shows in English.
 */
import ru from './ru.json';

export type Locale = 'en' | 'ru';
export const LOCALES: Locale[] = ['en', 'ru'];

const DICTIONARIES: Record<Locale, Record<string, string>> = { en: {}, ru: ru as Record<string, string> };

/** The language for a request's host name: ru.* is Russian, everything else English. */
export function localeFromHost(host?: string | null): Locale {
  return host && /^ru\./i.test(host.trim()) ? 'ru' : 'en';
}

/** The interface text in a language, with {name} placeholders filled in. */
export function translate(locale: Locale, text: string, vars?: Record<string, unknown>): string {
  const out = DICTIONARIES[locale][text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m)) : out;
}

/** The other address, for a language switch link. */
export function originFor(locale: Locale, current: string): string {
  try {
    const u = new URL(current);
    const bare = u.hostname.replace(/^ru\./i, '');
    u.hostname = locale === 'ru' ? `ru.${bare}` : bare;
    return u.origin;
  } catch {
    return locale === 'ru' ? 'https://ru.contextcloud.studio' : 'https://contextcloud.studio';
  }
}

/** Standing instruction for the AI on the Russian site. */
export const RUSSIAN_OUTPUT_NOTE =
  'LANGUAGE: The writer uses Studio in Russian. Write every piece of text meant for people (titles, descriptions, states, takes, notes, messages) in natural, literary Russian, even when the source is in another language; keep proper names as they are spelled in the source or in their usual Russian form. Keep JSON keys, ids and fixed vocabulary values (such as feeling ids) exactly as specified in English.';
