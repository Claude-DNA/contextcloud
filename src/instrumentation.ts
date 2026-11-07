/** Runs once when a server instance starts: make sure the database schema exists. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) return;
  const { ensureSchema } = await import('@/lib/migrations');
  await ensureSchema().catch(() => {});
}
