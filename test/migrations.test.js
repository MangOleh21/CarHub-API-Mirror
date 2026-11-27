import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { BODY_TYPE_OPTIONS, COLOR_OPTIONS } from '../src/constants/car-options.js';
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
    '004_add_car_images_and_reviewed_at',
    '005_add_submission_fuel_type_and_transmission_options',
    '006_add_car_archive',
    '007_add_car_color_and_body_type',
    '008_add_users',
    '009_add_listing_owner',
    '010_merge_admins_into_users',
  ]);
  assert.equal(firstRunSqlCount, 10);
  assert.equal(appliedSql.length, firstRunSqlCount);
  assert.match(appliedSql[1], /ALTER TABLE submissions ADD COLUMN location/);
  assert.match(appliedSql[2], /ADD COLUMN reviewed_by_email/);
  assert.match(appliedSql[2], /ADD COLUMN review_note/);
  assert.match(appliedSql[3], /ADD COLUMN IF NOT EXISTS images TEXT\[\]/);
  assert.match(appliedSql[3], /ADD COLUMN IF NOT EXISTS reviewed_at/);
  assert.match(appliedSql[4], /CHECK \(transmission IN \('Manual', 'Automatic', 'CVT', 'DCT', 'AMT'\)\)/);
  assert.match(appliedSql[4], /ADD COLUMN IF NOT EXISTS fuel_type VARCHAR\(50\)/);
  assert.doesNotMatch(appliedSql[4], /\bUPDATE\b/);
  assert.match(appliedSql[5], /ALTER TABLE cars\s+ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/);
  assert.match(appliedSql[6], /ADD COLUMN IF NOT EXISTS color VARCHAR\(30\)/);
  assert.match(appliedSql[6], /ADD COLUMN IF NOT EXISTS body_type VARCHAR\(30\)/);
  assert.match(appliedSql[7], /CREATE TABLE IF NOT EXISTS users/);
  assert.match(appliedSql[7], /CREATE TABLE IF NOT EXISTS user_sessions/);
  assert.match(appliedSql[8], /ALTER TABLE submissions\s+ADD COLUMN IF NOT EXISTS user_id BIGINT/);
  assert.match(appliedSql[8], /ALTER TABLE cars\s+ADD COLUMN IF NOT EXISTS user_id BIGINT/);
  assert.match(appliedSql[9], /ADD COLUMN IF NOT EXISTS role VARCHAR\(20\)/);
  assert.match(appliedSql[9], /DROP TABLE IF EXISTS admin_users/);
  assert.match(appliedSql[9], /ADD COLUMN IF NOT EXISTS reviewed_by_name VARCHAR\(150\)/);
  for (const color of COLOR_OPTIONS) {
    assert.ok(appliedSql[6].includes(`'${color}'`), `Missing color ${color} in migration 007`);
  }
  for (const bodyType of BODY_TYPE_OPTIONS) {
    assert.ok(appliedSql[6].includes(`'${bodyType}'`), `Missing bodyType ${bodyType} in migration 007`);
  }
});
