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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function isDbAvailable(): Promise<boolean> {
  const now = Date.now();
  if (dbAvailable === true) return true;
  if (dbAvailable === false && now - lastCheck < 10000) return false;

  lastCheck = now;
  // Neon auto-pauses on free tier — retry up to 3x with 2s delay to let it wake
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
      return true;
    } catch {
      if (attempt < 2) await sleep(2000);
    }
  }
  dbAvailable = false;
  return false;
}
