import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';

const origin = 'http://localhost:5173';
const sessionCookie = 'carhub_admin_session=test-token';

async function createClient(options = {}) {
  const admin = options.admin ?? {
    id: '2',
    email: 'admin@example.test',
    role: 'admin',
    isActive: true,
  };
  const app = createApp({
    carModel: {
      async list() { return { items: [], totalItems: 0 }; },
      async getById() { return null; },
    },
    submissionModel: {
      async create() { return null; },
      async list() { return { items: [], totalItems: 0 }; },
      async moderate() { return { kind: 'not_found' }; },
      ...options.submissionModel,
    },
    adminModel: {
      async getActiveSession() { return admin; },
      async findUserByEmail() { return null; },
      async createSession() {},
      async revokeSession() {},
    },
    allowedOrigins: [origin],
  });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  return {
    async request(path, requestOptions = {}) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: requestOptions.method ?? 'GET',
        headers: {
          ...(requestOptions.body ? { 'content-type': 'application/json' } : {}),
          ...(requestOptions.cookie ? { cookie: requestOptions.cookie } : {}),
          ...(requestOptions.origin ? { origin: requestOptions.origin } : {}),
        },
        body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
      });

      return { status: response.status, body: await response.json() };
    },
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

test('admin can list submissions with status filtering and pagination', async () => {
  let receivedFilters;
  const client = await createClient({
    submissionModel: {
      async list(filters) {
        receivedFilters = filters;
        return { items: [{ id: '8', status: 'pending' }], totalItems: 11 };
      },
    },
  });

  try {
    const response = await client.request(
      '/api/admin/submissions?status=pending&page=2&pageSize=5',
      { cookie: sessionCookie },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(receivedFilters, {
      status: 'pending',
      limit: 5,
      offset: 5,
    });
    assert.deepEqual(response.body.pagination, {
      page: 2,
      pageSize: 5,
      totalItems: 11,
      totalPages: 3,
    });
  } finally {
    await client.close();
  }
});

test('admin submission list defaults to pending and requires authentication', async () => {
  let listCalls = 0;
  const client = await createClient({
    submissionModel: {
      async list(filters) {
        listCalls += 1;
        assert.deepEqual(filters, { status: 'pending', limit: 20, offset: 0 });
        return { items: [], totalItems: 0 };
      },
    },
  });

  try {
    const denied = await client.request('/api/admin/submissions');
    assert.equal(denied.status, 401);
    assert.equal(listCalls, 0);

    const response = await client.request('/api/admin/submissions', {
      cookie: sessionCookie,
    });
    assert.equal(response.status, 200);
    assert.equal(listCalls, 1);
  } finally {
    await client.close();
  }
});

test('admin can list submissions across all statuses', async () => {
  let receivedFilters;
  const items = [
    { id: '8', status: 'pending' },
    { id: '7', status: 'approved' },
    { id: '6', status: 'rejected' },
  ];
  const client = await createClient({
    submissionModel: {
      async list(filters) {
        receivedFilters = filters;
        return { items, totalItems: items.length };
      },
    },
  });

  try {
    const response = await client.request('/api/admin/submissions?status=all', {
      cookie: sessionCookie,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(receivedFilters, {
      status: 'all',
      limit: 20,
      offset: 0,
    });
    assert.deepEqual(response.body.data.map(({ status }) => status), [
      'pending',
      'approved',
      'rejected',
    ]);
    assert.equal(response.body.pagination.totalItems, 3);
  } finally {
    await client.close();
  }
});

test('admin can approve a submission with a server-recorded reviewer and optional note', async () => {
  let moderation;
  const client = await createClient({
    submissionModel: {
      async moderate(id, input) {
        moderation = { id, ...input };
        return {
          kind: 'updated',
          submission: {
            id,
            status: 'approved',
            reviewedByEmail: input.reviewedByEmail,
            reviewNote: input.reviewNote,
          },
          car: { id: '91' },
        };
      },
    },
  });

  try {
    const response = await client.request('/api/admin/submissions/8/approved', {
      method: 'PATCH',
      cookie: sessionCookie,
      origin,
      body: {
        location: 'Jakarta',
        imageUrl: 'https://images.example/car.jpg',
        reviewNote: 'Dokumen dan kondisi kendaraan sudah diperiksa.',
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(moderation, {
      id: '8',
      status: 'approved',
      reviewedByEmail: 'admin@example.test',
      reviewNote: 'Dokumen dan kondisi kendaraan sudah diperiksa.',
      location: 'Jakarta',
      imageUrl: 'https://images.example/car.jpg',
    });
    assert.deepEqual(response.body.data, {
      submission: {
        id: '8',
        status: 'approved',
        reviewedByEmail: 'admin@example.test',
        reviewNote: 'Dokumen dan kondisi kendaraan sudah diperiksa.',
      },
      car: { id: '91' },
    });
  } finally {
    await client.close();
  }
});

test('admin can reject without a note and cannot approve legacy data without required fields', async () => {
  let receivedInput;
  const client = await createClient({
    submissionModel: {
      async moderate(id, input) {
        receivedInput = { id, ...input };
        return input.status === 'rejected'
          ? {
              kind: 'updated',
              submission: {
                id,
                status: 'rejected',
                reviewedByEmail: input.reviewedByEmail,
                reviewNote: input.reviewNote,
              },
              car: null,
            }
          : { kind: 'missing_fields', fields: ['location', 'imageUrl'] };
      },
    },
  });

  try {
    const rejected = await client.request('/api/admin/submissions/8/rejected', {
      method: 'PATCH',
      cookie: sessionCookie,
      origin,
      body: {},
    });
    assert.equal(rejected.status, 200);
    assert.deepEqual(rejected.body.data, {
      submission: {
        id: '8',
        status: 'rejected',
        reviewedByEmail: 'admin@example.test',
        reviewNote: null,
      },
      car: null,
    });

    const missingFields = await client.request('/api/admin/submissions/9/approved', {
      method: 'PATCH',
      cookie: sessionCookie,
      origin,
      body: {},
    });
    assert.equal(missingFields.status, 422);
    assert.equal(
      missingFields.body.error.code,
      'SUBMISSION_MISSING_REQUIRED_FIELDS',
    );
    assert.deepEqual(receivedInput, {
      id: '9',
      status: 'approved',
      reviewedByEmail: 'admin@example.test',
      reviewNote: null,
    });
  } finally {
    await client.close();
  }
});

test('admin cannot spoof reviewer email or repeat a decision, and the old status route is removed', async () => {
  let moderationCalls = 0;
  const client = await createClient({
    submissionModel: {
      async moderate() {
        moderationCalls += 1;
        return { kind: 'not_pending', status: 'approved' };
      },
    },
  });

  try {
    const input = {
      method: 'PATCH',
      cookie: sessionCookie,
      body: {},
    };
    const spoofedReviewer = await client.request('/api/admin/submissions/8/approved', {
      method: 'PATCH',
      cookie: sessionCookie,
      origin,
      body: { reviewedByEmail: 'attacker@example.test' },
    });
    assert.equal(spoofedReviewer.status, 422);
    assert.equal(moderationCalls, 0);

    const denied = await client.request('/api/admin/submissions/8/rejected', {
      ...input,
      origin: 'https://attacker.example',
    });
    assert.equal(denied.status, 403);
    assert.equal(moderationCalls, 0);

    const repeated = await client.request('/api/admin/submissions/8/approved', {
      ...input,
      origin,
    });
    assert.equal(repeated.status, 409);
    assert.equal(repeated.body.error.code, 'SUBMISSION_NOT_PENDING');
    assert.equal(moderationCalls, 1);

    const oldRoute = await client.request('/api/admin/submissions/8/status', {
      ...input,
      origin,
    });
    assert.equal(oldRoute.status, 404);
  } finally {
    await client.close();
  }
});
