import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encrypts small secrets (users' Gemini keys) at rest with AES-256-GCM.
 * The key is derived from AUTH_SECRET, so no extra environment variable is needed.
 * Note: changing AUTH_SECRET makes stored keys unreadable; users would re-enter them.
 */
const PREFIX = 'enc:v1:';

function key(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return Buffer.from(hkdfSync('sha256', secret, 'contextcloud', 'gemini-key-v1', 32));
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

/** Decrypts a sealed value. Values stored before encryption (plain text) are returned as they are. */
export function open(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const [iv, tag, ct] = stored.slice(PREFIX.length).split('.').map((s) => Buffer.from(s, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
