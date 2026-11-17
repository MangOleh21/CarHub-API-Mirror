import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';

const origin = 'http://localhost:5173';

async function request(app, path, options = {}) {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  try {
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
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function createRepositories(adminRepository) {
  return {
    carRepository: {
      async list() { return { items: [], totalItems: 0 }; },
      async getById() { return null; },
    },
    submissionRepository: {
      async create() { return { id: '1', status: 'pending' }; },
    },
    adminRepository,
  };
}

test('admin can log in, inspect the session, and log out with an HttpOnly cookie', async () => {
  const passwordHash = await hashPassword('a long admin password');
  let storedTokenHash;
  let sessionRevoked = false;
  const admin = { id: '3', email: 'owner@example.test', role: 'owner', isActive: true };
  const publicAdmin = { id: admin.id, email: admin.email, role: admin.role };
  const adminRepository = {
    async findUserByEmail(email) {
      assert.equal(email, admin.email);
      return { ...admin, passwordHash };
    },
    async createSession(session) {
      storedTokenHash = session.tokenHash;
    },
    async getActiveSession(tokenHash) {
      assert.equal(tokenHash, storedTokenHash);
      return sessionRevoked ? null : admin;
    },
    async revokeSession(tokenHash) {
      assert.equal(tokenHash, storedTokenHash);
      sessionRevoked = true;
    },
  };
  const app = createApp(createRepositories(adminRepository));

  const login = await request(app, '/api/admin/auth/login', {
    method: 'POST',
    origin,
    body: { email: admin.email, password: 'a long admin password' },
  });

  assert.equal(login.status, 200);
  assert.deepEqual(login.body.data.admin, publicAdmin);
  assert.match(login.setCookie, /HttpOnly/i);
  assert.match(login.setCookie, /SameSite=Lax/i);
  const cookie = login.setCookie.split(';')[0];
  const session = await request(app, '/api/admin/auth/session', { cookie });
  assert.equal(session.status, 200);
  assert.deepEqual(session.body.data.admin, publicAdmin);

  const logout = await request(app, '/api/admin/auth/logout', {
    method: 'POST',
    origin,
    cookie,
  });
  assert.equal(logout.status, 204);
  assert.match(logout.setCookie, /Expires=Thu, 01 Jan 1970/i);
});

test('login uses one generic response for unknown emails and wrong passwords', async () => {
  const adminRepository = {
    async findUserByEmail() { return null; },
    async createSession() { assert.fail('Invalid credentials must not create a session'); },
  };
  const app = createApp(createRepositories(adminRepository));

  const response = await request(app, '/api/admin/auth/login', {
    method: 'POST',
    origin,
    body: { email: 'missing@example.test', password: 'a long admin password' },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body.error, {
    code: 'INVALID_CREDENTIALS',
    message: 'Email or password is incorrect',
  });
  assert.equal(response.setCookie, null);
});

test('login rejects an untrusted browser origin', async () => {
  const app = createApp(createRepositories({
    async findUserByEmail() { assert.fail('Untrusted origin must be rejected before lookup'); },
  }));

  const response = await request(app, '/api/admin/auth/login', {
    method: 'POST',
    origin: 'https://attacker.example',
    body: { email: 'owner@example.test', password: 'a long admin password' },
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});
