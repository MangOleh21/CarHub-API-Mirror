import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool, normalizeSslMode } from '../src/config/pool.js';

test('database pool requires a connection string', () => {
  assert.throws(
    () => createPool(''),
    { message: 'DATABASE_URL is required' },
  );
});

test('database pool accepts PostgreSQL URLs only', () => {
  assert.throws(
    () => createPool('https://example.invalid'),
    { message: 'DATABASE_URL must be a PostgreSQL connection string' },
  );
});

test('database URLs explicitly preserve full verification for legacy SSL aliases', () => {
  for (const sslMode of ['prefer', 'require', 'verify-ca']) {
    const connectionString = new URL(
      normalizeSslMode(
        `postgresql://user:password@db.example.test/neondb?sslmode=${sslMode}&channel_binding=require`,
      ),
    );

    assert.equal(connectionString.searchParams.get('sslmode'), 'verify-full');
    assert.equal(connectionString.searchParams.get('channel_binding'), 'require');
  }
});

test('database URL normalization leaves other SSL modes unchanged', () => {
  const connectionString = normalizeSslMode(
    'postgresql://user:password@db.example.test/neondb?sslmode=verify-full',
  );

  assert.equal(new URL(connectionString).searchParams.get('sslmode'), 'verify-full');
});
