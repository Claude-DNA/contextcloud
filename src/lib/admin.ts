/** The site owner. Admin rights need this address AND a verified email (Google sign-in verifies it). */
export const ADMIN_EMAIL = 'baldnewguy@gmail.com';

export function isAdmin(user: { email?: string | null; role?: string | null; emailVerified?: boolean | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.email === ADMIN_EMAIL && user.emailVerified === true;
}
