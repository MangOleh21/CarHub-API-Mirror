import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

const origin = 'http://localhost:5173';
const loginPassword = 'a long admin password';

async function createClient(app) {
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
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
        setCookie: response.headers.get('set-cookie'),
      };
    },
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

function createModels(adminModel) {
  return {
    carModel: {
      async list() { return { items: [], totalItems: 0 }; },
      async getById() { return null; },
    },
    submissionModel: { async create() { return null; } },
    adminModel,
  };
}

async function login(client, email = 'owner@example.test') {
  const response = await client.request('/api/admin/auth/login', {
    method: 'POST',
    origin,
    body: { email, password: loginPassword },
  });
  assert.equal(response.status, 200);
  return response.setCookie.split(';')[0];
}

test('owner can create an admin without exposing its password hash', async () => {
  const owner = {
    id: '1',
    email: 'owner@example.test',
    role: 'owner',
    isActive: true,
    passwordHash: await hashPassword(loginPassword),
  };
  let createdAdmin;
  const adminRepository = {
    async findUserByEmail(email) {
      return email === owner.email ? owner : null;
    },
    async createSession() {},
    async getActiveSession() { return owner; },
    async createAdmin(input) {
      createdAdmin = input;
      return { id: '2', email: input.email, role: 'admin', isActive: true };
    },
  };
  const client = await createClient(createApp(createModels(adminRepository)));

  try {
    const cookie = await login(client);
    const untrustedOrigin = await client.request('/api/admin/users', {
      method: 'POST',
      origin: 'https://attacker.example',
      cookie,
      body: { email: 'newadmin@example.test', password: 'a new admin password' },
    });
    assert.equal(untrustedOrigin.status, 403);
    assert.equal(createdAdmin, undefined);

    const response = await client.request('/api/admin/users', {
      method: 'POST',
      origin,
      cookie,
      body: { email: ' NewAdmin@example.test ', password: 'a new admin password' },
    });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body.data.admin, {
      id: '2',
      email: 'newadmin@example.test',
      role: 'admin',
      isActive: true,
    });
    assert.equal(
      await verifyPassword('a new admin password', createdAdmin.passwordHash),
      true,
    );
    assert.equal(Object.hasOwn(response.body.data.admin, 'passwordHash'), false);
  } finally {
    await client.close();
  }
});

test('admin role cannot create another admin', async () => {
  const admin = {
    id: '2',
    email: 'admin@example.test',
    role: 'admin',
    isActive: true,
    passwordHash: await hashPassword(loginPassword),
  };
  let createCalls = 0;
  const adminRepository = {
    async findUserByEmail(email) {
      return email === admin.email ? admin : null;
    },
    async createSession() {},
    async getActiveSession() { return admin; },
    async createAdmin() { createCalls += 1; },
  };
  const client = await createClient(createApp(createModels(adminRepository)));

  try {
    const cookie = await login(client, admin.email);
    const denied = await client.request('/api/admin/users', {
      method: 'POST',
      origin,
      cookie,
      body: { email: 'another@example.test', password: 'a new admin password' },
    });
    assert.equal(denied.status, 403);

    assert.equal(createCalls, 0);
  } finally {
    await client.close();
  }
});

test('owner role cannot be requested in the admin creation payload', async () => {
  const owner = {
    id: '1',
    email: 'owner@example.test',
    role: 'owner',
    isActive: true,
    passwordHash: await hashPassword(loginPassword),
  };
  const adminRepository = {
    async findUserByEmail(email) {
      return email === owner.email ? owner : null;
    },
    async createSession() {},
    async getActiveSession() { return owner; },
    async createAdmin() { assert.fail('Unexpected owner role payload must be rejected'); },
  };
  const client = await createClient(createApp(createModels(adminRepository)));

  try {
    const cookie = await login(client);
    const response = await client.request('/api/admin/users', {
      method: 'POST',
      origin,
      cookie,
      body: {
        email: 'another@example.test',
        password: 'a new admin password',
        role: 'owner',
      },
    });

    assert.equal(response.status, 422);
  } finally {
    await client.close();
  }
});

test('owner can deactivate an admin but the owner account cannot be deactivated', async () => {
  const owner = {
    id: '1',
    email: 'owner@example.test',
    role: 'owner',
    isActive: true,
    passwordHash: await hashPassword(loginPassword),
  };
  let deactivatedId;
  const adminRepository = {
    async findUserByEmail(email) {
      return email === owner.email ? owner : null;
    },
    async createSession() {},
    async getActiveSession() { return owner; },
    async deactivateAdmin(id) {
      deactivatedId = id;
      return id === '2'
        ? { id, email: 'admin@example.test', role: 'admin', isActive: false }
        : null;
    },
  };
  const client = await createClient(createApp(createModels(adminRepository)));

  try {
    const cookie = await login(client);
    const deactivated = await client.request('/api/admin/users/2/deactivate', {
      method: 'PATCH',
      origin,
      cookie,
    });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.data.admin.isActive, false);

    const ownerDeactivation = await client.request('/api/admin/users/1/deactivate', {
      method: 'PATCH',
      origin,
      cookie,
    });
    assert.equal(ownerDeactivation.status, 404);
    assert.equal(deactivatedId, '1');
  } finally {
    await client.close();
  }
});
