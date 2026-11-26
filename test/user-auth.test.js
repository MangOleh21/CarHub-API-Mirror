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

function createModels(userModel, adminModel) {
  return {
    carModel: {
      async list() { return { items: [], totalItems: 0 }; },
      async getById() { return null; },
    },
    submissionModel: {
      async create() { return { id: '1', status: 'pending' }; },
    },
    adminModel: adminModel ?? {
      async findUserByEmail() { return null; },
      async createSession() {},
      async getActiveSession() { return null; },
      async revokeSession() {},
    },
    userModel,
  };
}

test('user can register, inspect session, update profile, and log out with HttpOnly cookie', async () => {
  let storedTokenHash;
  let sessionRevoked = false;
  let storedUser = null;

  const userRepository = {
    async findByEmail(email) {
      return storedUser && storedUser.email === email ? storedUser : null;
    },
    async create(input) {
      storedUser = {
        id: '10',
        name: input.name,
        email: input.email,
        phone: input.phone,
        location: input.location,
        isActive: true,
        createdAt: '2026-11-26T00:00:00.000Z',
        passwordHash: input.passwordHash,
      };
      return storedUser;
    },
    async createSession(session) {
      storedTokenHash = session.tokenHash;
    },
    async getActiveSession(tokenHash) {
      if (tokenHash !== storedTokenHash || sessionRevoked) return null;
      return {
        id: storedUser.id,
        name: storedUser.name,
        email: storedUser.email,
        phone: storedUser.phone,
        location: storedUser.location,
        createdAt: storedUser.createdAt,
      };
    },
    async updateProfile(id, data) {
      assert.equal(id, '10');
      storedUser = { ...storedUser, ...data };
      return storedUser;
    },
    async revokeSession(tokenHash) {
      assert.equal(tokenHash, storedTokenHash);
      sessionRevoked = true;
    },
  };

  const app = createApp(createModels(userRepository));
  const register = await request(app, '/api/auth/register', {
    method: 'POST',
    origin,
    body: {
      name: 'Budi Santoso',
      email: 'Budi@Example.Test',
      phone: '081234567890',
      location: 'Semarang',
      password: 'password123',
    },
  });

  assert.equal(register.status, 201);
  assert.equal(register.body.data.user.email, 'budi@example.test');
  assert.equal(register.body.data.user.passwordHash, undefined);
  assert.match(register.setCookie, /carhub_user_session=/);
  assert.match(register.setCookie, /HttpOnly/i);
  assert.match(register.setCookie, /Path=\/api/i);

  const cookie = register.setCookie.split(';')[0];
  const session = await request(app, '/api/auth/session', { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.body.data.user.name, 'Budi Santoso');

  const shortPasswordUpdate = await request(app, '/api/me', {
    method: 'PATCH',
    origin,
    cookie,
    body: {
      name: 'Budi S.',
      phone: '+6281234567890',
      location: 'Jakarta',
      newPassword: 'short',
    },
  });
  assert.equal(shortPasswordUpdate.status, 422);

  const updated = await request(app, '/api/me', {
    method: 'PATCH',
    origin,
    cookie,
    body: {
      name: 'Budi S.',
      phone: '+6281234567890',
      location: 'Jakarta',
      newPassword: 'newpassword123',
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.user.name, 'Budi S.');
  assert.equal(updated.body.data.user.location, 'Jakarta');
  assert.ok(storedUser.passwordHash && storedUser.passwordHash !== 'newpassword123');

  const logout = await request(app, '/api/auth/logout', {
    method: 'POST',
    origin,
    cookie,
  });
  assert.equal(logout.status, 204);
  assert.match(logout.setCookie, /Expires=Thu, 01 Jan 1970/i);

  const afterLogout = await request(app, '/api/me', { cookie });
  assert.equal(afterLogout.status, 401);
});

test('register rejects duplicate emails with 409 and login returns generic 401 on invalid credentials', async () => {
  const passwordHash = await hashPassword('valid-password');
  const app = createApp(createModels({
    async create() { return null; },
    async findByEmail(email) {
      if (email === 'user@example.test') {
        return {
          id: '11',
          name: 'Ayu',
          email,
          phone: '08123456789',
          location: null,
          isActive: true,
          passwordHash,
        };
      }
      return null;
    },
    async createSession() { assert.fail('Must not create session for failed auth'); },
    async getActiveSession() { return null; },
    async revokeSession() {},
  }));

  const duplicate = await request(app, '/api/auth/register', {
    method: 'POST',
    origin,
    body: {
      name: 'Ayu',
      email: 'user@example.test',
      phone: '08123456789',
      password: 'valid-password',
    },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'EMAIL_ALREADY_REGISTERED');

  const unknownEmail = await request(app, '/api/auth/login', {
    method: 'POST',
    origin,
    body: { email: 'missing@example.test', password: 'valid-password' },
  });
  const wrongPassword = await request(app, '/api/auth/login', {
    method: 'POST',
    origin,
    body: { email: 'user@example.test', password: 'wrong-password' },
  });

  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(unknownEmail.body, wrongPassword.body);
  assert.equal(wrongPassword.body.error.code, 'INVALID_CREDENTIALS');
});

test('user and admin session cookies are strictly isolated from each other', async () => {
  const app = createApp(createModels(
    {
      async getActiveSession() {
        return { id: '20', name: 'User', email: 'u@example.test', phone: '0812345678', location: null };
      },
      async findByEmail() { return null; },
      async create() { return null; },
      async createSession() {},
      async revokeSession() {},
    },
    {
      async getActiveSession() {
        return { id: '1', email: 'admin@example.test', role: 'admin' };
      },
      async findUserByEmail() { return null; },
      async createSession() {},
      async revokeSession() {},
    },
  ));

  const adminCookieOnUserRoute = await request(app, '/api/me', {
    cookie: 'carhub_admin_session=admin-token',
  });
  assert.equal(adminCookieOnUserRoute.status, 401);

  const userCookieOnAdminRoute = await request(app, '/api/admin/auth/session', {
    cookie: 'carhub_user_session=user-token',
  });
  assert.equal(userCookieOnAdminRoute.status, 401);

  const untrustedRegister = await request(app, '/api/auth/register', {
    method: 'POST',
    origin: 'https://attacker.example',
    body: {
      name: 'Eve',
      email: 'eve@example.test',
      phone: '08123456789',
      password: 'password123',
    },
  });
  assert.equal(untrustedRegister.status, 403);
});

test('GET /api/me/listings returns paginated user listings and validates status filters', async () => {
  let receivedQuery;
  const listing = {
    kind: 'car',
    id: '91',
    carId: '91',
    submissionId: null,
    status: 'active',
    brand: 'Toyota',
    model: 'Avanza',
    year: 2021,
    transmission: 'CVT',
    fuelType: 'Bensin',
    color: 'Putih',
    bodyType: 'MPV',
    mileage: 15000,
    price: '210000000',
    imageUrl: 'https://images.example/car.jpg',
    images: ['https://images.example/car.jpg'],
    sellerName: 'User',
    sellerPhone: '0812345678',
    location: 'Semarang',
    description: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: '2026-11-26T00:00:00.000Z',
  };
  const app = createApp(createModels({
    async getActiveSession() {
      return { id: '20', name: 'User', email: 'u@example.test', phone: '0812345678', location: 'Semarang' };
    },
    async listListingsByUser(query) {
      receivedQuery = query;
      return { items: [listing], totalItems: 1 };
    },
    async findByEmail() { return null; },
    async create() { return null; },
    async createSession() {},
    async revokeSession() {},
  }));

  const denied = await request(app, '/api/me/listings');
  assert.equal(denied.status, 401);

  const invalidStatus = await request(app, '/api/me/listings?status=approved', {
    cookie: 'carhub_user_session=user-token',
  });
  assert.equal(invalidStatus.status, 422);

  const ok = await request(app, '/api/me/listings?status=pending&page=2&pageSize=5', {
    cookie: 'carhub_user_session=user-token',
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(receivedQuery, {
    userId: '20',
    status: 'pending',
    limit: 5,
    offset: 5,
  });
  assert.deepEqual(ok.body.pagination, {
    page: 2,
    pageSize: 5,
    totalItems: 1,
    totalPages: 1,
  });
});
