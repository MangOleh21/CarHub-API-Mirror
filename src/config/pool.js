import pg from 'pg';

const { Pool } = pg;
const legacySslModes = new Set(['prefer', 'require', 'verify-ca']);

export function normalizeSslMode(databaseUrl) {
  const parsedUrl = new URL(databaseUrl);
  if (legacySslModes.has(parsedUrl.searchParams.get('sslmode'))) {
    parsedUrl.searchParams.set('sslmode', 'verify-full');
  }
  return parsedUrl.toString();
}

export function createPool(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  let protocol;
  try {
    protocol = new URL(databaseUrl).protocol;
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  return new Pool({
    connectionString: normalizeSslMode(databaseUrl),
    max: 5,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });
}
