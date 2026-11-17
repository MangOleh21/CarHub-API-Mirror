import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

const server = createServer(createApp({
  carModel: { async list() { return { items: [], totalItems: 0 }; }, async getById() { return null; } },
  submissionModel: { async create() { return null; } },
  adminModel: {
    async findUserByEmail() { return null; },
    async createSession() {},
    async getActiveSession() { return null; },
    async revokeSession() {},
  },
}));
let baseUrl;

before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

test('health endpoint confirms the API process is ready', async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('unknown routes return a safe, consistent 404 response', async () => {
  const response = await fetch(`${baseUrl}/api/not-found`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  });
});
