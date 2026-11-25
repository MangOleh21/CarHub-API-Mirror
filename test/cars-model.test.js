import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCarsModel } from '../src/models/carsModel.js';

const input = {
  brand: 'Toyota',
  model: 'Avanza',
  year: 2020,
  transmission: 'Automatic',
  fuelType: 'Bensin',
  mileage: 25_000,
  price: 180_000_000,
  imageUrl: 'https://images.example/car.jpg',
  images: ['https://images.example/car.jpg', 'https://images.example/car-side.jpg'],
  sellerName: 'Ayu',
  sellerPhone: '+628123456789',
  location: 'Jakarta',
  description: 'Terawat',
};

const car = {
  id: '12',
  ...input,
  price: '180000000',
};

test('car model creates, replaces, archives, and restores catalog rows', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('SET archived_at')) {
        return { rows: [{ id: '12' }] };
      }
      return { rows: [car] };
    },
  };
  const model = createCarsModel(pool);

  assert.deepEqual(await model.create(input), car);
  assert.deepEqual(await model.update('12', input), car);
  assert.deepEqual(await model.archiveById('12'), { id: '12' });
  assert.deepEqual(await model.restoreById('12'), { id: '12' });

  assert.match(calls[0].sql, /INSERT INTO cars/);
  assert.match(calls[1].sql, /UPDATE cars/);
  assert.deepEqual(calls[0].values, [
    input.brand,
    input.model,
    input.year,
    input.transmission,
    input.fuelType,
    input.mileage,
    input.price,
    input.imageUrl,
    input.images,
    input.sellerName,
    input.sellerPhone,
    input.location,
    input.description,
  ]);
  assert.deepEqual(calls[1].values, [...calls[0].values, '12']);
  assert.match(calls[2].sql, /UPDATE cars\s+SET archived_at = COALESCE\(archived_at, NOW\(\)\)\s+WHERE id = \$1/);
  assert.match(calls[3].sql, /UPDATE cars\s+SET archived_at = NULL\s+WHERE id = \$1/);
  assert.deepEqual(calls[2].values, ['12']);
  assert.deepEqual(calls[3].values, ['12']);
});

test('car model filters and sorts catalog records with parameterized values', async () => {
  const calls = [];
  const model = createCarsModel({
    async query(sql, values) {
      calls.push({ sql, values });
      return sql.includes('COUNT(*)')
        ? { rows: [{ count: '1' }] }
        : { rows: [car] };
    },
  });

  const result = await model.list({
    search: 'Toyota',
    brand: 'Toyota',
    transmission: 'Automatic',
    minPrice: 100_000_000,
    maxPrice: 200_000_000,
    minYear: 2018,
    maxYear: 2022,
    sortBy: 'price',
    sortOrder: 'asc',
    limit: 12,
    offset: 0,
  });

  assert.deepEqual(result, { items: [car], totalItems: 1 });
  assert.match(calls[0].sql, /transmission = \$3/);
  assert.match(calls[0].sql, /price >= \$4/);
  assert.match(calls[0].sql, /price <= \$5/);
  assert.match(calls[0].sql, /year >= \$6/);
  assert.match(calls[0].sql, /year <= \$7/);
  assert.match(calls[1].sql, /ORDER BY price ASC, id ASC/);
  assert.deepEqual(calls[1].values, [
    '%Toyota%',
    'Toyota',
    'Automatic',
    100_000_000,
    200_000_000,
    2018,
    2022,
    12,
    0,
  ]);
});

test('active catalog lookups and brands exclude archived cars', async () => {
  const calls = [];
  const model = createCarsModel({
    async query(sql) {
      calls.push(sql);
      return sql.includes('COUNT(*)')
        ? { rows: [{ count: '1' }] }
        : sql.includes('SELECT brand')
          ? { rows: [{ brand: 'Toyota' }] }
          : { rows: [car] };
    },
  });

  await model.list({ limit: 20, offset: 0 });
  await model.getById('12');
  await model.listBrands();

  assert.match(calls[0], /archived_at IS NULL/);
  assert.match(calls[1], /archived_at IS NULL/);
  assert.match(calls[2], /archived_at IS NULL/);
  assert.match(calls[3], /archived_at IS NULL/);
});

test('archive listing includes only archived cars', async () => {
  const calls = [];
  const model = createCarsModel({
    async query(sql) {
      calls.push(sql);
      return sql.includes('COUNT(*)')
        ? { rows: [{ count: '1' }] }
        : { rows: [car] };
    },
  });

  await model.list({ archiveStatus: 'archived', limit: 20, offset: 0 });

  assert.match(calls[0], /archived_at IS NOT NULL/);
  assert.match(calls[1], /archived_at IS NOT NULL/);
});

test('car model lists distinct catalog brands in case-insensitive alphabetical order', async () => {
  let queryText;
  const model = createCarsModel({
    async query(sql) {
      queryText = sql;
      return { rows: [{ brand: 'Honda' }, { brand: 'Toyota' }] };
    },
  });

  assert.deepEqual(await model.listBrands(), ['Honda', 'Toyota']);
  assert.match(
    queryText.replace(/\s+/g, ' '),
    /SELECT brand FROM \(SELECT DISTINCT brand FROM cars WHERE archived_at IS NULL\) AS catalog_brands ORDER BY LOWER\(brand\), brand/,
  );
});
