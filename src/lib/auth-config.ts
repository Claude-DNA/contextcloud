import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { query, isDbAvailable } from '@/lib/db';
import { getAppleClientSecret } from '@/lib/apple-secret';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_PRIVATE_KEY
      ? [
          Apple({
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: getAppleClientSecret(),
          }),
        ]
      : []),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        if (!email || !password) return null;

        if (!(await isDbAvailable())) return null;

        const res = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
        const user = res.rows[0];
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role || 'user',
          emailVerified: user.email_verified || false,
          authEpoch: user.auth_epoch ?? 0,
        };
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account) {
        if (account.provider !== 'credentials' && user.email) {
          try {
            if (await isDbAvailable()) {
              const existing = await query(
                'SELECT id, role, email_verified, password_hash, auth_epoch FROM users WHERE LOWER(email) = LOWER($1)',
                [user.email]
              );
              if (existing.rows.length === 0) {
                const userId = crypto.randomUUID();
                await query(
                  'INSERT INTO users (id, email, name, image, password_hash, email_verified) VALUES ($1, $2, $3, $4, $5, TRUE)',
                  [userId, user.email, user.name || '', user.image || '', 'oauth-' + account.provider]
                );
                token.sub = userId;
                token.role = 'user';
                token.emailVerified = true;
                token.authEpoch = 0;
              } else {
                const row = existing.rows[0];
                let epoch = row.auth_epoch ?? 0;
                if (!row.email_verified) {
                  // The provider has just proved this person owns the address, but the existing account was
                  // created with a password nobody verified. It may have been registered by someone else to
                  // squat on this email, so the verified owner takes it over: the old password stops working,
                  // every existing session and API key is cancelled, and the email is marked verified.
                  const claimed = await query(
                    `UPDATE users SET password_hash = $2, email_verified = TRUE, auth_epoch = auth_epoch + 1
                     WHERE id = $1 RETURNING auth_epoch`,
                    [row.id, 'oauth-' + account.provider]
                  );
                  await query('UPDATE user_api_keys SET is_active = FALSE WHERE user_id = $1', [row.id]);
                  epoch = claimed.rows[0]?.auth_epoch ?? epoch + 1;
                }
                token.sub = row.id;
                token.role = row.role || 'user';
                token.emailVerified = true;
                token.authEpoch = epoch;
              }
            }
          } catch (e) {
            console.error('OAuth auto-register failed:', e);
          }
        } else {
          token.sub = user.id;
          token.role = (user as unknown as Record<string, unknown>).role || 'user';
          token.emailVerified = (user as unknown as Record<string, unknown>).emailVerified || false;
          token.authEpoch = ((user as unknown as Record<string, unknown>).authEpoch as number) ?? 0;
        }
        token.provider = account.provider;
      }

      if (token.sub) {
        try {
          if (await isDbAvailable()) {
            const userRefresh = await query(
              'SELECT role, email_verified, auth_epoch FROM users WHERE id = $1',
              [token.sub]
            );
            // Account deleted, or its sessions were cancelled after this token was issued: sign out.
            if (userRefresh.rows.length === 0) return null;
            if ((userRefresh.rows[0].auth_epoch ?? 0) !== ((token.authEpoch as number) ?? 0)) return null;
            if (userRefresh.rows.length > 0) {
              token.role = userRefresh.rows[0].role || 'user';
              token.emailVerified = userRefresh.rows[0].email_verified ?? false;
            }
          }
        } catch {
          /* refresh failed, keep existing */
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        (session.user as unknown as Record<string, unknown>).provider = token.provider;
        (session.user as unknown as Record<string, unknown>).role = token.role || 'user';
        (session.user as unknown as Record<string, unknown>).emailVerified = token.emailVerified ?? false;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
});
