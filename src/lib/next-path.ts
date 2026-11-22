/**
 * Where to go after signing in: the page's ?callbackUrl= if it is a path on this site, otherwise "/".
 * Read from window.location so the auth pages need no Suspense boundary.
 */
export function nextPath(): string {
  if (typeof window === 'undefined') return '/';
  const p = new URLSearchParams(window.location.search).get('callbackUrl');
  return p && p.startsWith('/') && !p.startsWith('//') ? p : '/';
}

/** "?callbackUrl=..." to carry the destination between the sign-in and sign-up pages. */
export function nextQuery(): string {
  const p = nextPath();
  return p === '/' ? '' : `?callbackUrl=${encodeURIComponent(p)}`;
}

/**
 * The same destination as a full address on this site. Google and Apple sign-in finish on the main
 * domain, so a Russian-site visitor needs the full ru. address to be brought back there.
 */
export function nextUrl(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.origin + nextPath();
}
