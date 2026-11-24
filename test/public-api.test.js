import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';

const car = {
  id: '7',
  brand: 'Toyota',
  model: 'Avanza',
  year: 2020,
  transmission: 'Automatic',
  fuelType: 'Bensin',
  mileage: 25_000,
  price: '180000000',
  imageUrl: 'https://images.example/car.jpg',
  sellerName: 'Ayu',
  sellerPhone: '628123456789',
  location: 'Jakarta',
  description: null,
  createdAt: '2026-11-17T00:00:00.000Z',
};

function createTestApp(options = {}) {
  return createApp({
    carModel: {
      async list() { return { items: [], totalItems: 0 }; },
      async getById() { return null; },
    },
    submissionModel: {
      async create() {
        return { id: '1', status: 'pending', createdAt: '2026-11-17T00:00:00.000Z' };
      },
    },
    adminModel: {
      async findUserByEmail() { return null; },
      async createSession() {},
      async getActiveSession() { return null; },
      async revokeSession() {},
    },
    ...options,
  });
}

async function request(app, path, options = {}) {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('car list validates filters and returns paginated results', async () => {
  let receivedFilters;
  const app = createTestApp({
    carModel: {
      async list(filters) {
        receivedFilters = filters;
        return { items: [car], totalItems: 11 };
      },
    },
  });

  const response = await request(
    app,
    '/api/cars?search=toyota&brand=Toyota&page=2&pageSize=10',
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedFilters, {
    search: 'toyota',
    brand: 'Toyota',
    limit: 10,
    offset: 10,
  });
  assert.deepEqual(response.body, {
    success: true,
    data: [car],
    pagination: {
      page: 2,
      pageSize: 10,
      totalItems: 11,
      totalPages: 2,
    },
  });
});

test('car detail returns 404 when the repository has no matching car', async () => {
  const app = createTestApp({
    carModel: {
      async getById() {
        return null;
      },
    },
  });

  const response = await request(app, '/api/cars/404');

  assert.equal(response.status, 404);
  assert.deepEqual(response.body.error, {
    code: 'NOT_FOUND',
    message: 'Car not found',
  });
});

test('car list rejects out-of-range pagination', async () => {
  const app = createTestApp({
    carModel: {
      async list() {
        assert.fail('Invalid filters must not reach the repository');
      },
    },
  });

  const response = await request(app, '/api/cars?pageSize=101');

  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('submission endpoint validates input and returns the pending submission', async () => {
  let receivedInput;
  const app = createTestApp({
    submissionModel: {
      async create(input) {
        receivedInput = input;
        return {
          id: '55',
          status: 'pending',
          createdAt: '2026-11-17T00:00:00.000Z',
        };
      },
    },
  });

  const response = await request(app, '/api/submissions', {
    method: 'POST',
    body: {
      sellerName: 'Ayu',
      sellerPhone: '628123456789',
      brand: 'Toyota',
      model: 'Avanza',
      year: 2020,
      transmission: 'Automatic',
      mileage: 25_000,
      expectedPrice: 180_000_000,
      location: 'Jakarta',
      imageUrl: 'https://images.example/car.jpg',
      description: 'Terawat',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(receivedInput.sellerName, 'Ayu');
  assert.equal(receivedInput.location, 'Jakarta');
  assert.equal(receivedInput.imageUrl, 'https://images.example/car.jpg');
  assert.equal(response.body.data.status, 'pending');
});

test('submission endpoint rejects non-HTTPS image URLs and non-positive prices', async () => {
  const app = createTestApp({
    submissionModel: {
      async create() {
        assert.fail('Invalid submission must not reach the repository');
      },
    },
  });

  const response = await request(app, '/api/submissions', {
    method: 'POST',
    body: {
      sellerName: 'Ayu',
      sellerPhone: '628123456789',
      brand: 'Toyota',
      model: 'Avanza',
      year: 2020,
      transmission: 'Automatic',
      mileage: 25_000,
      expectedPrice: 0,
      location: 'Jakarta',
      imageUrl: 'javascript:alert(1)',
    },
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('submission endpoint requires seller location and an HTTPS image URL', async () => {
  const app = createTestApp({
    submissionModel: {
      async create() {
        assert.fail('Submission missing required car data must not be stored');
      },
    },
  });
  const baseSubmission = {
    sellerName: 'Ayu',
    sellerPhone: '628123456789',
    brand: 'Toyota',
    model: 'Avanza',
    year: 2020,
    transmission: 'Automatic',
    mileage: 25_000,
    expectedPrice: 180_000_000,
    imageUrl: 'https://images.example/car.jpg',
  };

  const missingLocation = await request(app, '/api/submissions', {
    method: 'POST',
    body: baseSubmission,
  });
  const missingImage = await request(app, '/api/submissions', {
    method: 'POST',
    body: { ...baseSubmission, location: 'Jakarta', imageUrl: undefined },
  });

  assert.equal(missingLocation.status, 422);
  assert.equal(missingImage.status, 422);
});

test('submission endpoint rejects a Vercel Blob URL whose contents are not an image', async () => {
  const originalFetch = globalThis.fetch;
  const app = createTestApp({
    submissionModel: {
      async create() {
        assert.fail('Invalid uploaded images must not be stored');
      },
    },
  });
  globalThis.fetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://store.public.blob.vercel-storage.com/submissions/not-image.png') {
      return new Response('not an image', {
        status: 206,
        headers: { 'content-type': 'image/png' },
      });
    }
    return originalFetch(input, options);
  };

  try {
    const response = await request(app, '/api/submissions', {
      method: 'POST',
      body: {
        sellerName: 'Ayu',
        sellerPhone: '628123456789',
        brand: 'Toyota',
        model: 'Avanza',
        year: 2020,
        transmission: 'Automatic',
        mileage: 25_000,
        expectedPrice: 180_000_000,
        location: 'Jakarta',
        imageUrl: 'https://store.public.blob.vercel-storage.com/submissions/not-image.png',
      },
    });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'INVALID_IMAGE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('car list accepts transmission, price, year, and sort filters', async () => {
  let receivedFilters;
  const app = createTestApp({
    carModel: {
      async list(filters) {
        receivedFilters = filters;
        return { items: [car], totalItems: 1 };
      },
    },
  });

  const response = await request(
    app,
    '/api/cars?transmission=Manual&minPrice=100000000&maxPrice=250000000&minYear=2018&maxYear=2023&sort=price_asc',
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedFilters, {
    transmission: 'Manual',
    minPrice: 100000000,
    maxPrice: 250000000,
    minYear: 2018,
    maxYear: 2023,
    sort: 'price_asc',
    limit: 20,
    offset: 0,
  });
});

test('submission endpoint accepts multiple images array', async () => {
  let createdSubmission;
  const app = createTestApp({
    submissionModel: {
      async create(input) {
        createdSubmission = input;
        return { id: '10', status: 'pending', createdAt: '2026-11-24' };
      },
    },
  });

  const response = await request(app, '/api/submissions', {
    method: 'POST',
    body: {
      sellerName: 'Ayu',
      sellerPhone: '+628123456789',
      brand: 'Honda',
      model: 'Civic',
      year: 2021,
      transmission: 'Manual',
      mileage: 15_000,
      expectedPrice: 350_000_000,
      location: 'Surabaya',
      images: [
        'https://example.test/car1.jpg',
        'https://example.test/car2.jpg',
      ],
    },
  });

  assert.equal(response.status, 201);
  assert.equal(createdSubmission.imageUrl, 'https://example.test/car1.jpg');
  assert.deepEqual(createdSubmission.images, [
    'https://example.test/car1.jpg',
    'https://example.test/car2.jpg',
  ]);
});
