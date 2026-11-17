import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function runMigrations(client, migrationDirectory, logger = console) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  for (const filename of migrationFiles) {
    const version = filename.slice(0, -4);
    const result = await client.query(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [version],
    );

    if (result.rowCount > 0) {
      logger.log(`Migration ${version} is already applied`);
      continue;
    }

    const migrationSql = await readFile(join(migrationDirectory, filename), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(migrationSql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version],
      );
      await client.query('COMMIT');
      logger.log(`Applied migration ${version}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}
