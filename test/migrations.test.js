import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { runMigrations } from '../src/database/migrationRunner.js';

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));

test('migration runner applies each numbered migration once in order', async () => {
  const appliedVersions = new Set();
  const appliedSql = [];
  const client = {
    async query(sql, values = []) {
      const statement = sql.trim();
      if (statement.startsWith('SELECT version FROM schema_migrations')) {
        const alreadyApplied = appliedVersions.has(values[0]);
        return { rowCount: alreadyApplied ? 1 : 0, rows: [] };
      }

      if (statement.startsWith('INSERT INTO schema_migrations')) {
        appliedVersions.add(values[0]);
        return { rowCount: 1, rows: [] };
      }

      if (
        statement.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')
        || ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)
      ) {
        return { rowCount: 0, rows: [] };
      }

      appliedSql.push(statement);
      return { rowCount: 0, rows: [] };
    },
  };

  await runMigrations(client, migrationDirectory, { log() {} });
  const firstRunSqlCount = appliedSql.length;
  await runMigrations(client, migrationDirectory, { log() {} });

  assert.deepEqual([...appliedVersions], [
    '001_initial_schema',
    '002_add_submission_location',
    '003_add_submission_review_details',
  ]);
  assert.equal(firstRunSqlCount, 3);
  assert.equal(appliedSql.length, firstRunSqlCount);
  assert.match(appliedSql[1], /ALTER TABLE submissions ADD COLUMN location/);
  assert.match(appliedSql[2], /ADD COLUMN reviewed_by_email/);
  assert.match(appliedSql[2], /ADD COLUMN review_note/);
});
