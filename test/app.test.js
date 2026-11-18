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

test('database failures log a safe error code without exposing the message', async () => {
  const logEntries = [];
  const databaseError = Object.assign(new Error('do-not-log-this-detail'), {
    code: '42P01',
  });
  const app = createApp({
    carModel: {
      async list() { throw databaseError; },
      async getById() { return null; },
    },
    submissionModel: { async create() { return null; } },
    adminModel: {
      async findUserByEmail() { return null; },
      async createSession() {},
      async getActiveSession() { return null; },
      async revokeSession() {},
    },
    logger: {
      error(...entry) { logEntries.push(entry); },
    },
  });
  const errorServer = createServer(app);
  errorServer.listen(0, '127.0.0.1');
  await once(errorServer, 'listening');
  const address = errorServer.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/cars`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
    assert.deepEqual(logEntries, [[
      'API request failed',
      {
        path: '/api/cars',
        errorName: 'Error',
        errorClass: 'Error',
        errorCode: '42P01',
      },
    ]]);
    assert.doesNotMatch(JSON.stringify(logEntries), /do-not-log-this-detail/);
  } finally {
    errorServer.close();
    await once(errorServer, 'close');
  }
});

test('image provider failures log their safe error class without exposing the message', async () => {
  const logEntries = [];
  class ImageProviderError extends Error {}
  const app = createApp({
    carModel: {
      async list() { throw new ImageProviderError('Access denied'); },
      async getById() { return null; },
    },
    submissionModel: { async create() { return null; } },
    adminModel: {
      async findUserByEmail() { return null; },
      async createSession() {},
      async getActiveSession() { return null; },
      async revokeSession() {},
    },
    logger: {
      error(...entry) { logEntries.push(entry); },
    },
  });
  const errorServer = createServer(app);
  errorServer.listen(0, '127.0.0.1');
  await once(errorServer, 'listening');
  const address = errorServer.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/cars`);

    assert.equal(response.status, 500);
    assert.deepEqual(logEntries, [[
      'API request failed',
      {
        path: '/api/cars',
        errorName: 'Error',
        errorClass: 'ImageProviderError',
      },
    ]]);
    assert.doesNotMatch(JSON.stringify(logEntries), /Access denied/);
  } finally {
    errorServer.close();
    await once(errorServer, 'close');
  }
});
