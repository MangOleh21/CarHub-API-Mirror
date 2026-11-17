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

test('car model creates, replaces, and permanently deletes catalog rows', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('DELETE FROM cars')) {
        return { rows: [{ id: '12' }] };
      }
      return { rows: [car] };
    },
  };
  const model = createCarsModel(pool);

  assert.deepEqual(await model.create(input), car);
  assert.deepEqual(await model.update('12', input), car);
  assert.deepEqual(await model.deleteById('12'), { id: '12' });

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
    input.sellerName,
    input.sellerPhone,
    input.location,
    input.description,
  ]);
  assert.deepEqual(calls[1].values, [...calls[0].values, '12']);
  assert.match(calls[2].sql, /DELETE FROM cars WHERE id = \$1/);
  assert.deepEqual(calls[2].values, ['12']);
});
