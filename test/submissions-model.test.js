import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSubmissionsModel } from '../src/models/submissionsModel.js';

const submission = {
  id: '5',
  sellerName: 'Ayu',
  sellerPhone: '628123456789',
  brand: 'Toyota',
  model: 'Avanza',
  year: 2020,
  transmission: 'Automatic',
  mileage: 25_000,
  expectedPrice: '180000000',
  imageUrl: null,
  location: null,
  description: 'Terawat',
  status: 'pending',
};

function createPool(submissionRow) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, values = []) {
      const statement = sql.trim();
      calls.push({ statement, values });

      if (statement === 'BEGIN' || statement === 'COMMIT' || statement === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (statement.includes('FROM submissions') && statement.includes('FOR UPDATE')) {
        return {
          rows: submissionRow ? [submissionRow] : [],
          rowCount: submissionRow ? 1 : 0,
        };
      }
      if (statement.startsWith('INSERT INTO cars')) {
        return { rows: [{ id: '91' }], rowCount: 1 };
      }
      if (statement.startsWith('UPDATE submissions')) {
        return {
          rows: [{ id: submissionRow.id, status: values[0] }],
          rowCount: 1,
        };
      }

      assert.fail(`Unexpected SQL in moderation test: ${statement}`);
    },
    release() {
      released = true;
    },
  };

  return {
    pool: { async connect() { return client; } },
    calls,
    wasReleased: () => released,
  };
}

test('approval atomically creates a car and prefers seller data over admin fallbacks', async () => {
  const sellerSubmission = {
    ...submission,
    imageUrl: 'https://seller.example/car.jpg',
    location: 'Bandung',
  };
  const { pool, calls, wasReleased } = createPool(sellerSubmission);
  const model = createSubmissionsModel(pool);

  const result = await model.moderate('5', {
    status: 'approved',
    location: 'Jakarta',
    imageUrl: 'https://admin.example/car.jpg',
  });

  const insertCall = calls.find(({ statement }) => statement.startsWith('INSERT INTO cars'));
  const lockCall = calls.find(({ statement }) => (
    statement.includes('FROM submissions') && statement.includes('FOR UPDATE')
  ));
  const insertIndex = calls.findIndex(({ statement }) => statement.startsWith('INSERT INTO cars'));
  const statusUpdateIndex = calls.findIndex(({ statement }) => statement.startsWith('UPDATE submissions'));
  const commitIndex = calls.findIndex(({ statement }) => statement === 'COMMIT');
  assert.deepEqual(result, {
    kind: 'updated',
    submission: { id: '5', status: 'approved' },
    car: { id: '91' },
  });
  assert.equal(insertCall.values[5], '180000000');
  assert.equal(insertCall.values[6], 'https://seller.example/car.jpg');
  assert.equal(insertCall.values[9], 'Bandung');
  assert.ok(lockCall);
  assert.ok(insertIndex < statusUpdateIndex && statusUpdateIndex < commitIndex);
  assert.deepEqual(
    calls.filter(({ statement }) => ['BEGIN', 'COMMIT'].includes(statement))
      .map(({ statement }) => statement),
    ['BEGIN', 'COMMIT'],
  );
  assert.equal(wasReleased(), true);
});

test('approval of legacy submission requires missing location or photo before creating a car', async () => {
  const { pool, calls } = createPool(submission);
  const model = createSubmissionsModel(pool);

  const result = await model.moderate('5', {
    status: 'approved',
    location: 'Jakarta',
  });

  assert.deepEqual(result, {
    kind: 'missing_fields',
    fields: ['imageUrl'],
  });
  assert.equal(calls.some(({ statement }) => statement.startsWith('INSERT INTO cars')), false);
  assert.equal(calls.at(-1).statement, 'ROLLBACK');
});

test('approval fills missing legacy submission fields from the admin payload', async () => {
  const { pool, calls } = createPool(submission);
  const model = createSubmissionsModel(pool);

  const result = await model.moderate('5', {
    status: 'approved',
    location: 'Jakarta',
    imageUrl: 'https://images.example/car.jpg',
  });

  const insertCall = calls.find(({ statement }) => statement.startsWith('INSERT INTO cars'));
  assert.equal(result.kind, 'updated');
  assert.equal(insertCall.values[6], 'https://images.example/car.jpg');
  assert.equal(insertCall.values[9], 'Jakarta');
});

test('a submission that is no longer pending cannot create another catalog car', async () => {
  const { pool, calls } = createPool({ ...submission, status: 'approved' });
  const model = createSubmissionsModel(pool);

  const result = await model.moderate('5', { status: 'approved' });

  assert.deepEqual(result, { kind: 'not_pending', status: 'approved' });
  assert.equal(calls.some(({ statement }) => statement.startsWith('INSERT INTO cars')), false);
  assert.equal(calls.at(-1).statement, 'ROLLBACK');
});

test('rejecting a submission updates its status without creating a catalog car', async () => {
  const { pool, calls } = createPool(submission);
  const model = createSubmissionsModel(pool);

  const result = await model.moderate('5', { status: 'rejected' });

  assert.deepEqual(result, {
    kind: 'updated',
    submission: { id: '5', status: 'rejected' },
    car: null,
  });
  assert.equal(calls.some(({ statement }) => statement.startsWith('INSERT INTO cars')), false);
  assert.equal(calls.at(-1).statement, 'COMMIT');
});
