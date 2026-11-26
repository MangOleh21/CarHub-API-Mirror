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

const origin = 'http://localhost:5173';
const userSessionCookie = 'carhub_user_session=test-user-token';

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
    userModel: {
      async findByEmail() { return null; },
      async create() { return null; },
      async updateProfile() { return null; },
      async listListingsByUser() { return { items: [], totalItems: 0 }; },
      async createSession() {},
      async getActiveSession() {
        return {
          id: '15',
          name: 'Ayu',
          email: 'ayu@example.test',
          phone: '628123456789',
          location: 'Jakarta',
        };
      },
      async revokeSession() {},
    },
    allowedOrigins: [origin],
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
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.origin ? { origin: options.origin } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
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
    sortBy: 'createdAt',
    sortOrder: 'desc',
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

test('public car brands endpoint returns the current distinct catalog brands', async () => {
  const app = createTestApp({
    carModel: {
      async listBrands() { return ['Honda', 'Toyota']; },
    },
  });

  const response = await request(app, '/api/cars/brands');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    data: ['Honda', 'Toyota'],
  });
});

test('car list accepts range filters and sorting and rejects inverted ranges', async () => {
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
    '/api/cars?minPrice=100000000&maxPrice=200000000&minYear=2018&maxYear=2022&transmission=CVT&fuelType=Hybrid&color=Putih&bodyType=SUV&bodyType=MPV&sortBy=price&sortOrder=asc',
  );
  assert.equal(response.status, 200);
  assert.deepEqual(receivedFilters, {
    transmission: 'CVT',
    fuelType: 'Hybrid',
    color: 'Putih',
    bodyType: ['SUV', 'MPV'],
    minPrice: 100_000_000,
    maxPrice: 200_000_000,
    minYear: 2018,
    maxYear: 2022,
    sortBy: 'price',
    sortOrder: 'asc',
    limit: 20,
    offset: 0,
  });

  const invalidRange = await request(app, '/api/cars?minPrice=200&maxPrice=100');
  assert.equal(invalidRange.status, 422);
  assert.equal(invalidRange.body.error.code, 'VALIDATION_ERROR');

  const invalidBodyType = await request(app, '/api/cars?bodyType=Coupe');
  assert.equal(invalidBodyType.status, 422);
  assert.equal(invalidBodyType.body.error.code, 'VALIDATION_ERROR');
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
    origin,
    cookie: userSessionCookie,
    body: {
      sellerName: 'Ayu',
      sellerPhone: '628123456789',
      brand: 'Toyota',
      model: 'Avanza',
      year: 2020,
      transmission: 'CVT',
      fuelType: 'Listrik',
      color: 'Putih',
      bodyType: 'MPV',
      mileage: 25_000,
      expectedPrice: 180_000_000,
      location: 'Jakarta',
      images: [
        'https://images.example/car.jpg',
        'https://images.example/car-side.jpg',
      ],
      description: 'Terawat',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(receivedInput.userId, '15');
  assert.equal(receivedInput.sellerName, 'Ayu');
  assert.equal(receivedInput.transmission, 'CVT');
  assert.equal(receivedInput.fuelType, 'Listrik');
  assert.equal(receivedInput.color, 'Putih');
  assert.equal(receivedInput.bodyType, 'MPV');
  assert.equal(receivedInput.location, 'Jakarta');
  assert.equal(receivedInput.imageUrl, 'https://images.example/car.jpg');
  assert.deepEqual(receivedInput.images, [
    'https://images.example/car.jpg',
    'https://images.example/car-side.jpg',
  ]);
  assert.equal(response.body.data.status, 'pending');
});

test('submission endpoint requires user authentication and trusted origin', async () => {
  const app = createTestApp({
    submissionModel: {
      async create() {
        assert.fail('Unauthenticated submission must not reach the repository');
      },
    },
  });

  const unauthenticated = await request(app, '/api/submissions', {
    method: 'POST',
    origin,
    body: { brand: 'Toyota' },
  });
  assert.equal(unauthenticated.status, 401);

  const untrustedOrigin = await request(app, '/api/submissions', {
    method: 'POST',
    origin: 'https://attacker.example',
    cookie: userSessionCookie,
    body: { brand: 'Toyota' },
  });
  assert.equal(untrustedOrigin.status, 403);
});

test('submission endpoint defaults fuel type and seller contact from user profile when omitted', async () => {
  let receivedInput;
  const app = createTestApp({
    submissionModel: {
      async create(input) {
        receivedInput = input;
        return { id: '56', status: 'pending', createdAt: '2026-11-17T00:00:00.000Z' };
      },
    },
  });

  const response = await request(app, '/api/submissions', {
    method: 'POST',
    origin,
    cookie: userSessionCookie,
    body: {
      brand: 'Toyota',
      model: 'Avanza',
      year: 2020,
      transmission: 'Manual',
      color: 'Hitam',
      bodyType: 'SUV',
      mileage: 25_000,
      expectedPrice: 180_000_000,
      location: 'Jakarta',
      imageUrl: 'https://images.example/car.jpg',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(receivedInput.userId, '15');
  assert.equal(receivedInput.sellerName, 'Ayu');
  assert.equal(receivedInput.sellerPhone, '628123456789');
  assert.equal(receivedInput.fuelType, 'Bensin');
  assert.equal(receivedInput.color, 'Hitam');
  assert.equal(receivedInput.bodyType, 'SUV');
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
    origin,
    cookie: userSessionCookie,
    body: {
      sellerName: 'Ayu',
      sellerPhone: '628123456789',
      brand: 'Toyota',
      model: 'Avanza',
      year: 2020,
      transmission: 'Automatic',
      color: 'Putih',
      bodyType: 'MPV',
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
    color: 'Putih',
    bodyType: 'MPV',
    mileage: 25_000,
    expectedPrice: 180_000_000,
    imageUrl: 'https://images.example/car.jpg',
  };

  const missingLocation = await request(app, '/api/submissions', {
    method: 'POST',
    origin,
    cookie: userSessionCookie,
    body: baseSubmission,
  });
  const missingImage = await request(app, '/api/submissions', {
    method: 'POST',
    origin,
    cookie: userSessionCookie,
    body: { ...baseSubmission, location: 'Jakarta', imageUrl: undefined },
  });
  const missingBodyType = await request(app, '/api/submissions', {
    method: 'POST',
    origin,
    cookie: userSessionCookie,
    body: { ...baseSubmission, location: 'Jakarta', bodyType: undefined },
  });

  assert.equal(missingLocation.status, 422);
  assert.equal(missingImage.status, 422);
  assert.equal(missingBodyType.status, 422);
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
    const url = input instanceof Request ? input.url : input;
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
      origin,
      cookie: userSessionCookie,
      body: {
        sellerName: 'Ayu',
        sellerPhone: '628123456789',
        brand: 'Toyota',
        model: 'Avanza',
        year: 2020,
        transmission: 'Automatic',
        color: 'Putih',
        bodyType: 'MPV',
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
