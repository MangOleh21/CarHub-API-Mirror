import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from '../config/pool.js';

const migrationVersion = '001_initial_schema';
const migrationPath = new URL('../../migrations/001_initial_schema.sql', import.meta.url);
const migrationSql = await readFile(fileURLToPath(migrationPath), 'utf8');
const pool = createPool();
const client = await pool.connect();

try {
  await client.query('BEGIN');
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await client.query(
    'SELECT version FROM schema_migrations WHERE version = $1',
    [migrationVersion],
  );

  if (result.rowCount > 0) {
    await client.query('ROLLBACK');
    console.log(`Migration ${migrationVersion} is already applied`);
  } else {
    await client.query(migrationSql);
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1)',
      [migrationVersion],
    );
    await client.query('COMMIT');
    console.log(`Applied migration ${migrationVersion}`);
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
