import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  const text = strings.reduce((prev, curr, i) => prev + '$' + i + curr);
  return pool.query(text, values);
}

export async function getClient() {
  return pool.connect();
}

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

let dbAvailable: boolean | null = null;
let lastCheck = 0;
export async function isDbAvailable(): Promise<boolean> {
  const now = Date.now();
  if (dbAvailable === true) return true;
  if (dbAvailable === false && now - lastCheck < 10000) return false;

  lastCheck = now;
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}
