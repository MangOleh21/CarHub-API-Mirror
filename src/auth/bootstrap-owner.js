import { z } from 'zod';
import { hashPassword } from './password.js';

const ownerInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
}).strict();

export class BootstrapOwnerError extends Error {}

export async function bootstrapOwner(adminRepository, input) {
  const parsed = ownerInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BootstrapOwnerError('Owner email or password does not meet the requirements');
  }

  const owner = await adminRepository.createInitialOwner({
    email: parsed.data.email.toLowerCase(),
    passwordHash: await hashPassword(parsed.data.password),
  });

  if (!owner) {
    throw new BootstrapOwnerError('An owner account already exists; bootstrap can only run once');
  }

  return owner;
}
