import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';

const origin = 'http://localhost:5173';
const sessionCookie = 'carhub_admin_session=test-token';
const carInput = {
  brand: 'Toyota',
  model: 'Avanza',
  year: 2020,
  transmission: 'Automatic',
  mileage: 25_000,
  price: 180_000_000,
  imageUrl: 'https://images.example/car.jpg',
  sellerName: 'Ayu',
  sellerPhone: '+628123456789',
  location: 'Jakarta',
};
const car = {
  id: '12',
  ...carInput,
  fuelType: 'Bensin',
  price: '180000000',
  description: null,
};

async function createClient(carModel) {
  const app = createApp({
    carModel,
    submissionModel: {
      async create() { return null; },
      async list() { return { items: [], totalItems: 0 }; },
      async moderate() { return { kind: 'not_found' }; },
    },
    adminModel: {
      async getActiveSession() {
        return { id: '2', email: 'admin@example.test', role: 'admin' };
      },
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

test('admin can list and read cars but public access does not bypass admin authentication', async () => {
  let receivedFilters;
  const client = await createClient({
    async list(filters) {
      receivedFilters = filters;
      return { items: [car], totalItems: 1 };
    },
    async getById(id) {
      return id === car.id ? car : null;
    },
  });

  try {
    const denied = await client.request('/api/admin/cars');
    assert.equal(denied.status, 401);

    const list = await client.request('/api/admin/cars?page=2&pageSize=5', {
      cookie: sessionCookie,
    });
    assert.equal(list.status, 200);
    assert.deepEqual(receivedFilters, {
      limit: 5,
      offset: 5,
    });
    assert.deepEqual(list.body.data, [car]);

    const detail = await client.request('/api/admin/cars/12', {
      cookie: sessionCookie,
    });
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.data, car);
  } finally {
    await client.close();
  }
});

test('admin can create a car with validated catalog fields', async () => {
  let receivedInput;
  const client = await createClient({
    async create(input) {
      receivedInput = input;
      return car;
    },
  });

  try {
    const response = await client.request('/api/admin/cars', {
      method: 'POST',
      cookie: sessionCookie,
      origin,
      body: carInput,
    });

    assert.equal(response.status, 201);
    assert.equal(receivedInput.fuelType, 'Bensin');
    assert.equal(receivedInput.description, null);
    assert.deepEqual(response.body.data, car);
  } finally {
    await client.close();
  }
});

test('admin can replace a car and hard-delete it', async () => {
  let updatedInput;
  let deletedId;
  const client = await createClient({
    async update(id, input) {
      updatedInput = { id, ...input };
      return { ...car, model: input.model };
    },
    async deleteById(id) {
      deletedId = id;
      return { id };
    },
  });

  try {
    const update = await client.request('/api/admin/cars/12', {
      method: 'PUT',
      cookie: sessionCookie,
      origin,
      body: { ...carInput, model: 'Avanza Veloz', description: 'Terawat' },
    });
    assert.equal(update.status, 200);
    assert.equal(updatedInput.id, '12');
    assert.equal(update.body.data.model, 'Avanza Veloz');

    const deletion = await client.request('/api/admin/cars/12', {
      method: 'DELETE',
      cookie: sessionCookie,
      origin,
    });
    assert.equal(deletion.status, 204);
    assert.equal(deletion.body, null);
    assert.equal(deletedId, '12');
  } finally {
    await client.close();
  }
});

test('admin car writes reject untrusted origins, invalid payloads, and missing records', async () => {
  let writeCalls = 0;
  const client = await createClient({
    async create() {
      writeCalls += 1;
      return car;
    },
    async update() {
      writeCalls += 1;
      return null;
    },
    async deleteById() {
      writeCalls += 1;
      return null;
    },
  });

  try {
    const denied = await client.request('/api/admin/cars', {
      method: 'POST',
      cookie: sessionCookie,
      origin: 'https://attacker.example',
      body: carInput,
    });
    assert.equal(denied.status, 403);
    assert.equal(writeCalls, 0);

    const invalid = await client.request('/api/admin/cars', {
      method: 'POST',
      cookie: sessionCookie,
      origin,
      body: { ...carInput, imageUrl: 'http://images.example/car.jpg' },
    });
    assert.equal(invalid.status, 422);

    const updateMissing = await client.request('/api/admin/cars/99', {
      method: 'PUT',
      cookie: sessionCookie,
      origin,
      body: carInput,
    });
    assert.equal(updateMissing.status, 404);

    const deleteMissing = await client.request('/api/admin/cars/99', {
      method: 'DELETE',
      cookie: sessionCookie,
      origin,
    });
    assert.equal(deleteMissing.status, 404);
  } finally {
    await client.close();
  }
});

test('admin car writes reject Vercel Blob URLs whose contents are not images', async () => {
  const originalFetch = globalThis.fetch;
  let writeCalls = 0;
  const client = await createClient({
    async create() {
      writeCalls += 1;
      return car;
    },
  });
  globalThis.fetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://store.public.blob.vercel-storage.com/cars/not-image.png') {
      return new Response('not an image', {
        status: 206,
        headers: { 'content-type': 'image/png' },
      });
    }
    return originalFetch(input, options);
  };

  try {
    const response = await client.request('/api/admin/cars', {
      method: 'POST',
      cookie: sessionCookie,
      origin,
      body: { ...carInput, imageUrl: 'https://store.public.blob.vercel-storage.com/cars/not-image.png' },
    });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'INVALID_IMAGE');
    assert.equal(writeCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await client.close();
  }
});
