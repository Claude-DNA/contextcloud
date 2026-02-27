import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { query, isDbAvailable } from '@/lib/db';
import { getAppleClientSecret } from '@/lib/apple-secret';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
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

        const res = await query('SELECT * FROM users WHERE email = $1', [email]);
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
                'SELECT id, role, email_verified FROM users WHERE email = $1',
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
              } else {
                token.sub = existing.rows[0].id;
                token.role = existing.rows[0].role || 'user';
                token.emailVerified = existing.rows[0].email_verified ?? true;
              }
            }
          } catch (e) {
            console.error('OAuth auto-register failed:', e);
          }
        } else {
          token.sub = user.id;
          token.role = (user as unknown as Record<string, unknown>).role || 'user';
          token.emailVerified = (user as unknown as Record<string, unknown>).emailVerified || false;
        }
        token.provider = account.provider;
      }

      if (token.sub) {
        try {
          if (await isDbAvailable()) {
            const userRefresh = await query(
              'SELECT role, email_verified FROM users WHERE id = $1',
              [token.sub]
            );
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
