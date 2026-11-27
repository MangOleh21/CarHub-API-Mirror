import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createImageUploadService, maxImageSizeBytes } from '../src/services/image-upload.js';

const origin = 'http://localhost:5173';
const sessionCookie = 'carhub_user_session=test-token';
const uploadUrl = 'https://api.cloudinary.com/v1_1/carhub-demo/image/upload';
const uploadFields = {
  api_key: 'public-key',
  asset_folder: 'carhub/cars',
  allowed_formats: 'jpg,png,webp',
  overwrite: false,
  public_id: 'random-image-id',
  signature: 'signed-upload',
  timestamp: 301,
  upload_preset: 'carhub-signed',
};

test('image upload service signs a unique Cloudinary asset without returning the API secret', async () => {
  let signedParams;
  let signingSecret;
  const service = createImageUploadService({
    now: () => 1_000,
    createId: () => 'random-image-id',
    getConfig: () => ({
      cloudName: 'carhub-demo',
      apiKey: 'public-key',
      apiSecret: 'server-only-secret',
      uploadPreset: 'carhub-signed',
    }),
    signRequest: (params, secret) => {
      signedParams = params;
      signingSecret = secret;
      return 'signed-upload';
    },
  });

  const result = await service({ kind: 'submissions', contentType: 'image/jpeg' });

  assert.equal(result.uploadUrl, uploadUrl);
  assert.equal(result.uploadFields.timestamp, 1);
  assert.equal(result.uploadFields.public_id, 'random-image-id');
  assert.equal(result.uploadFields.asset_folder, 'carhub/submissions');
  assert.equal(result.uploadFields.overwrite, false);
  assert.equal(result.uploadFields.upload_preset, 'carhub-signed');
  assert.equal(result.uploadFields.api_key, 'public-key');
  assert.equal(result.uploadFields.signature, 'signed-upload');
  assert.deepEqual(signedParams, {
    timestamp: 1,
    public_id: 'random-image-id',
    asset_folder: 'carhub/submissions',
    upload_preset: 'carhub-signed',
    overwrite: false,
    allowed_formats: 'jpg,png,webp',
  });
  assert.equal(signingSecret, 'server-only-secret');
  assert.doesNotMatch(JSON.stringify(result), /server-only-secret/);
  assert.equal(maxImageSizeBytes, 5 * 1024 * 1024);
});

async function createClient(imageUploadService = async () => ({ uploadUrl, uploadFields })) {
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

test('public submission upload signing returns the Cloudinary upload URL and signed fields', async () => {
  let received;
  const client = await createClient(async (input) => {
    received = input;
    return { uploadUrl, uploadFields };
  });

  try {
    const response = await client.request('/api/uploads/submissions', {
      body: { contentType: 'image/png', size: 1024 },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { success: true, data: { uploadUrl, uploadFields } });
    assert.deepEqual(received, { kind: 'submissions', contentType: 'image/png' });
  } finally {
    await client.close();
  }
});

test('image upload presigning rejects unsupported types and sizes over 5 MiB', async () => {
  let serviceCalls = 0;
  const client = await createClient(async () => {
    serviceCalls += 1;
    return { uploadUrl, uploadFields };
  });

  try {
    const unsupported = await client.request('/api/uploads/submissions', {
      body: { contentType: 'image/svg+xml', size: 1024 },
    });
    const oversized = await client.request('/api/uploads/submissions', {
      body: { contentType: 'image/jpeg', size: maxImageSizeBytes + 1 },
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
    return { uploadUrl, uploadFields };
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
