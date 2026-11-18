import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createImageUploadService, maxImageSizeBytes } from '../src/services/image-upload.js';

const origin = 'http://localhost:5173';
const sessionCookie = 'carhub_admin_session=test-token';
const uploadUrl = 'https://store.public.blob.vercel-storage.com/cars/test.png?signature=secret';
const imageUrl = 'https://store.public.blob.vercel-storage.com/cars/test.png';

test('image upload service issues a short-lived URL scoped to one public image object', async () => {
  const calls = [];
  const service = createImageUploadService({
    now: () => 1_000,
    createId: () => 'random-image-id',
    issueSignedToken: async (options) => {
      calls.push({ operation: 'issue', options });
      return { delegationToken: 'delegation', clientSigningToken: 'signing-key', validUntil: 301_000 };
    },
    presignUrl: async (token, options) => {
      calls.push({ operation: 'presign', token, options });
      return { presignedUrl: 'https://store.public.blob.vercel-storage.com/submissions/random-image-id.jpg?token=short-lived' };
    },
  });

  const result = await service({ kind: 'submissions', contentType: 'image/jpeg' });

  assert.equal(result.uploadUrl, 'https://store.public.blob.vercel-storage.com/submissions/random-image-id.jpg?token=short-lived');
  assert.equal(result.imageUrl, 'https://store.public.blob.vercel-storage.com/submissions/random-image-id.jpg');
  assert.equal(maxImageSizeBytes, 5 * 1024 * 1024);
  assert.equal(calls[0].options.pathname, 'submissions/random-image-id.jpg');
  assert.deepEqual(calls[0].options.operations, ['put']);
  assert.deepEqual(calls[0].options.allowedContentTypes, ['image/jpeg']);
  assert.equal(calls[0].options.maximumSizeInBytes, maxImageSizeBytes);
  assert.equal(calls[0].options.validUntil, 301_000);
  assert.equal(calls[1].token.clientSigningToken, 'signing-key');
  assert.equal(calls[1].options.allowOverwrite, false);
  assert.equal(calls[1].options.maximumSizeInBytes, maxImageSizeBytes);
})

async function createClient(imageUploadService = async () => ({ uploadUrl, imageUrl })) {
  const app = createApp({
    carModel: { async list() { return { items: [], totalItems: 0 }; }, async getById() { return null; } },
    submissionModel: { async create() { return null; } },
    adminModel: {
      async getActiveSession() { return { id: '2', email: 'admin@example.test', role: 'admin' }; },
      async findUserByEmail() { return null; },
      async createSession() {},
      async revokeSession() {},
    },
    allowedOrigins: [origin],
    imageUploadService,
  });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  return {
    async request(path, { body, cookie, requestOrigin = origin } = {}) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: requestOrigin,
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

test('public submission upload presigning returns only the scoped upload and image URLs', async () => {
  let received;
  const client = await createClient(async (input) => {
    received = input;
    return { uploadUrl, imageUrl };
  });

  try {
    const response = await client.request('/api/uploads/submissions', {
      body: { contentType: 'image/png', size: 1024 },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { success: true, data: { uploadUrl, imageUrl } });
    assert.deepEqual(received, { kind: 'submissions', contentType: 'image/png' });
  } finally {
    await client.close();
  }
});

test('image upload presigning rejects unsupported types and sizes over 5 MB', async () => {
  let serviceCalls = 0;
  const client = await createClient(async () => {
    serviceCalls += 1;
    return { uploadUrl, imageUrl };
  });

  try {
    const unsupported = await client.request('/api/uploads/submissions', {
      body: { contentType: 'image/svg+xml', size: 1024 },
    });
    const oversized = await client.request('/api/uploads/submissions', {
      body: { contentType: 'image/jpeg', size: 5 * 1024 * 1024 + 1 },
    });

    assert.equal(unsupported.status, 422);
    assert.equal(oversized.status, 422);
    assert.equal(serviceCalls, 0);
  } finally {
    await client.close();
  }
});

test('admin car upload presigning requires a session and a trusted origin', async () => {
  let serviceCalls = 0;
  const client = await createClient(async () => {
    serviceCalls += 1;
    return { uploadUrl, imageUrl };
  });

  try {
    const unauthenticated = await client.request('/api/admin/uploads/cars', {
      body: { contentType: 'image/webp', size: 1024 },
    });
    const untrustedOrigin = await client.request('/api/admin/uploads/cars', {
      body: { contentType: 'image/webp', size: 1024 },
      cookie: sessionCookie,
      requestOrigin: 'https://attacker.example',
    });
    const authorized = await client.request('/api/admin/uploads/cars', {
      body: { contentType: 'image/webp', size: 1024 },
      cookie: sessionCookie,
    });

    assert.equal(unauthenticated.status, 401);
    assert.equal(untrustedOrigin.status, 403);
    assert.equal(authorized.status, 200);
    assert.equal(serviceCalls, 1);
  } finally {
    await client.close();
  }
});

test('public submission upload presigning applies a per-process request limit', async () => {
  const client = await createClient();

  try {
    const responses = await Promise.all(Array.from({ length: 11 }, () => client.request(
      '/api/uploads/submissions',
      { body: { contentType: 'image/jpeg', size: 1024 } },
    )));

    assert.equal(responses.filter((response) => response.status === 200).length, 10);
    assert.equal(responses.filter((response) => response.status === 429).length, 1);
    assert.equal(responses.find((response) => response.status === 429).body.error.code, 'RATE_LIMITED');
  } finally {
    await client.close();
  }
});
