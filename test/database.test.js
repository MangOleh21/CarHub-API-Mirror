import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/config/pool.js';

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
