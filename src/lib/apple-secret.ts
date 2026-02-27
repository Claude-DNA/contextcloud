import jwt from 'jsonwebtoken';

let cachedSecret: string | null = null;
let cachedAt = 0;

export function getAppleClientSecret(): string {
  if (cachedSecret && Date.now() - cachedAt < 5 * 30 * 24 * 60 * 60 * 1000) {
    return cachedSecret;
  }

  const teamId = process.env.APPLE_TEAM_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!teamId || !clientId || !keyId || !privateKey) {
    throw new Error('Missing Apple OAuth env vars');
  }

  cachedSecret = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '180d',
    audience: 'https://appleid.apple.com',
    issuer: teamId,
    subject: clientId,
    keyid: keyId,
  });

  cachedAt = Date.now();
  return cachedSecret;
}
