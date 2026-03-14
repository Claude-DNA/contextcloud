import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // 5s — enough for Neon wake (1-3s), fails fast for retries
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

// TTLs: re-check healthy DB every 60s, retry failed DB after 10s
const DB_OK_TTL = 60_000;
const DB_FAIL_TTL = 10_000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function isDbAvailable(): Promise<boolean> {
  const now = Date.now();
  if (dbAvailable === true && now - lastCheck < DB_OK_TTL) return true;
  if (dbAvailable === false && now - lastCheck < DB_FAIL_TTL) return false;

  lastCheck = now;
  // Retry up to 3x with 1.5s delay
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(1500);
    }
  }
  console.error('[db] isDbAvailable failed after retries:', lastErr);
  dbAvailable = false;
  return false;
}
