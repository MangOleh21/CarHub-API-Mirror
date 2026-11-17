import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootstrapOwner } from '../src/auth/bootstrap-owner.js';
import { verifyPassword } from '../src/auth/password.js';

test('bootstrap creates one owner and refuses a second owner', async () => {
  let owner = null;
  const adminRepository = {
    async createInitialOwner(input) {
      if (owner) {
        return null;
      }

      owner = {
        id: '1',
        email: input.email,
        role: 'owner',
        isActive: true,
        passwordHash: input.passwordHash,
      };
      return { id: owner.id, email: owner.email, role: owner.role };
    },
  };

  const created = await bootstrapOwner(adminRepository, {
    email: '  OWNER@example.test ',
    password: 'a strong owner password',
  });

  assert.deepEqual(created, {
    id: '1',
    email: 'owner@example.test',
    role: 'owner',
  });
  assert.equal(
    await verifyPassword('a strong owner password', owner.passwordHash),
    true,
  );
  await assert.rejects(
    bootstrapOwner(adminRepository, {
      email: 'another@example.test',
      password: 'another strong password',
    }),
    /owner account already exists/i,
  );
});
