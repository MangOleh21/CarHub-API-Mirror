import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUsersModel } from '../src/models/usersModel.js';

test('usersModel.listListingsByUser builds parameterized queries for all, active, and submission statuses', async () => {
  const calls = [];
  const model = createUsersModel({
    async query(sql, values) {
      calls.push({ sql, values });
      return sql.includes('COUNT(*)')
        ? { rows: [{ count: '2' }] }
        : { rows: [{ kind: 'car', id: '1' }] };
    },
  });

  await model.listListingsByUser({ userId: '42', status: 'all', limit: 10, offset: 0 });
  assert.match(calls[0].sql, /UNION ALL/);
  assert.deepEqual(calls[1].values, ['42', 10, 0]);

  calls.length = 0;
  await model.listListingsByUser({ userId: '42', status: 'active', limit: 10, offset: 0 });
  assert.doesNotMatch(calls[0].sql, /UNION ALL/);
  assert.match(calls[0].sql, /FROM cars/);
  assert.deepEqual(calls[1].values, ['42', 10, 0]);

  calls.length = 0;
  await model.listListingsByUser({ userId: '42', status: 'rejected', limit: 5, offset: 5 });
  assert.match(calls[0].sql, /FROM submissions/);
  assert.match(calls[0].sql, /status = \$2/);
  assert.deepEqual(calls[1].values, ['42', 'rejected', 5, 5]);
});
