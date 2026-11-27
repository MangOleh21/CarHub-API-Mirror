import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';

const origin = 'http://localhost:5173';
const adminCookie = 'carhub_user_session=admin-token';

const sampleUser = {
  id: '12',
  name: 'Budi Santoso',
  email: 'budi@example.test',
  phone: '+6281234567890',
  location: 'Semarang',
  isActive: true,
  createdAt: '2026-11-26T00:00:00.000Z',
};

async function createClient(userModel) {
  const app = createApp({
    carModel: {
      async list() { return { items: [], totalItems: 0 }; },
      async getById() { return null; },
    },
    submissionModel: {
      async create() { return null; },
      async list() { return { items: [], totalItems: 0 }; },
      async moderate() { return { kind: 'not_found' }; },
    },
    adminModel: {
      async getActiveSession() {
        return { id: '2', email: 'admin@example.test', role: 'admin', isActive: true };
      },
      async findUserByEmail() { return null; },
      async createSession() {},
      async revokeSession() {},
    },
    userModel: {
      async findByEmail() { return null; },
      async findById() { return null; },
      async create() { return null; },
      async updateProfile() { return null; },
      async listUsers() { return { items: [], totalItems: 0 }; },
      async updateByAdmin() { return { kind: 'not_found' }; },
      async deleteById() { return null; },
      async listListingsByUser() { return { items: [], totalItems: 0 }; },
      async createSession() {},
      async getActiveSession() { return null; },
      async revokeSession() {},
      ...userModel,
    },
    allowedOrigins: [origin],
  });

  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  return {
    async request(path, options = {}) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.cookie ? { cookie: options.cookie } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      };
    },
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

test('admin can list, create, update, and delete public users with validation and auth checks', async () => {
  let receivedListQuery;
  let createdInput;
  let updatedCall;
  let deletedId;

  const client = await createClient({
    async listUsers(query) {
      receivedListQuery = query;
      return { items: [{ ...sampleUser, passwordHash: 'secret' }], totalItems: 1 };
    },
    async create(input) {
      createdInput = input;
      return { ...sampleUser, name: input.name, email: input.email };
    },
    async updateByAdmin(id, input) {
      updatedCall = { id, input };
      return {
        kind: 'updated',
        user: { ...sampleUser, ...input, id },
      };
    },
    async deleteById(id) {
      deletedId = id;
      return { id };
    },
  });

  try {
    const unauthenticated = await client.request('/api/admin/customers');
    assert.equal(unauthenticated.status, 401);

    const list = await client.request('/api/admin/customers?search=budi&status=active&page=2&pageSize=5', {
      cookie: adminCookie,
    });
    assert.equal(list.status, 200);
    assert.deepEqual(receivedListQuery, {
      search: 'budi',
      status: 'active',
      limit: 5,
      offset: 5,
    });
    assert.equal(list.body.data[0].passwordHash, undefined);

    const created = await client.request('/api/admin/customers', {
      method: 'POST',
      cookie: adminCookie,
      origin,
      body: {
        name: 'Siti Aminah',
        email: 'Siti@Example.Test',
        phone: '081234567890',
        location: 'Bandung',
        password: 'password123',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(createdInput.email, 'siti@example.test');
    assert.ok(createdInput.passwordHash && createdInput.passwordHash !== 'password123');

    const updated = await client.request('/api/admin/customers/12', {
      method: 'PUT',
      cookie: adminCookie,
      origin,
      body: {
        name: 'Budi Updated',
        email: 'budi@example.test',
        phone: '+6281234567890',
        location: 'Jakarta',
        isActive: false,
        password: 'resetpassword123',
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updatedCall.id, '12');
    assert.equal(updatedCall.input.isActive, false);
    assert.ok(updatedCall.input.passwordHash);

    const untrustedDelete = await client.request('/api/admin/customers/12', {
      method: 'DELETE',
      cookie: adminCookie,
      origin: 'https://attacker.example',
    });
    assert.equal(untrustedDelete.status, 403);

    const deleted = await client.request('/api/admin/customers/12', {
      method: 'DELETE',
      cookie: adminCookie,
      origin,
    });
    assert.equal(deleted.status, 204);
    assert.equal(deletedId, '12');
  } finally {
    await client.close();
  }
});

test('admin customer write endpoints return 409 on duplicate email and 404 on missing user', async () => {
  const client = await createClient({
    async create() { return null; },
    async updateByAdmin(id) {
      return id === '99' ? { kind: 'not_found' } : { kind: 'email_exists' };
    },
    async deleteById() { return null; },
  });

  try {
    const dupCreate = await client.request('/api/admin/customers', {
      method: 'POST',
      cookie: adminCookie,
      origin,
      body: {
        name: 'Ayu',
        email: 'dup@example.test',
        phone: '081234567890',
        password: 'password123',
      },
    });
    assert.equal(dupCreate.status, 409);
    assert.equal(dupCreate.body.error.code, 'EMAIL_ALREADY_REGISTERED');

    const dupUpdate = await client.request('/api/admin/customers/12', {
      method: 'PUT',
      cookie: adminCookie,
      origin,
      body: {
        name: 'Ayu',
        email: 'dup@example.test',
        phone: '081234567890',
        isActive: true,
      },
    });
    assert.equal(dupUpdate.status, 409);

    const missingUpdate = await client.request('/api/admin/customers/99', {
      method: 'PUT',
      cookie: adminCookie,
      origin,
      body: {
        name: 'Ayu',
        email: 'ok@example.test',
        phone: '081234567890',
        isActive: true,
      },
    });
    assert.equal(missingUpdate.status, 404);

    const missingDelete = await client.request('/api/admin/customers/99', {
      method: 'DELETE',
      cookie: adminCookie,
      origin,
    });
    assert.equal(missingDelete.status, 404);
  } finally {
    await client.close();
  }
});
