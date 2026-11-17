import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { createPool } from '../config/pool.js';
import { runMigrations } from './migrationRunner.js';

const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
const pool = createPool();

try {
  const client = await pool.connect();
  try {
    await runMigrations(client, migrationDirectory);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
