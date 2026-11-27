import { z } from 'zod';
import { hashPassword } from '../auth/password.js';

const optionalPhoneSchema = z.string().trim().refine(
  (value) => value === '' || /^\+?[0-9][0-9\s()-]{7,19}$/.test(value),
  { message: 'Invalid phone number' },
).optional();
const optionalLocationSchema = z.string().trim().max(150).nullable().optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const createAdminSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  email: z.string().trim().email().max(254),
  phone: optionalPhoneSchema,
  location: optionalLocationSchema,
  isActive: z.boolean().optional(),
  password: z.string().min(12).max(128),
}).strict();

const updateAdminSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254),
  phone: optionalPhoneSchema,
  location: optionalLocationSchema,
  isActive: z.boolean(),
  password: z.string().min(12).max(128).optional(),
}).strict();

const adminIdSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);

function safeAdmin(admin) {
  return {
    id: admin.id,
    ...(admin.name ? { name: admin.name } : {}),
    email: admin.email,
    ...(admin.phone !== undefined ? { phone: admin.phone } : {}),
    ...(admin.location !== undefined ? { location: admin.location } : {}),
    role: admin.role,
    isActive: admin.isActive,
  };
}

export function createAdminUsersController(adminModel) {
  return {
    list: async (_request, response) => {
      const admins = await adminModel.listAdmins();
      return response.status(200).json({
        success: true,
        data: admins.map((admin) => ({
          ...safeAdmin(admin),
          ...(admin.phone !== undefined ? { phone: admin.phone } : {}),
          ...(admin.location !== undefined ? { location: admin.location } : {}),
          createdAt: admin.createdAt,
        })),
      });
    },

    create: async (request, response) => {
      const parsed = createAdminSchema.safeParse(request.body);
      if (!parsed.success) {
        return response.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid admin data',
            details: parsed.error.flatten().fieldErrors,
          },
        });
      }

      const admin = await adminModel.createAdmin({
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.location !== undefined ? { location: parsed.data.location } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        email: parsed.data.email.toLowerCase(),
        passwordHash: await hashPassword(parsed.data.password),
      });

      if (!admin) {
        return response.status(409).json({
          error: {
            code: 'ADMIN_EMAIL_EXISTS',
            message: 'An admin account with this email already exists',
          },
        });
      }

      return response.status(201).json({
        success: true,
        data: { admin: safeAdmin(admin) },
      });
    },

    update: async (request, response) => {
      const parsedId = adminIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return response.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid admin id',
          },
        });
      }

      const parsed = updateAdminSchema.safeParse(request.body);
      if (!parsed.success) {
        return response.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid admin data',
            details: parsed.error.flatten().fieldErrors,
          },
        });
      }

      const passwordHash = parsed.data.password
        ? await hashPassword(parsed.data.password)
        : undefined;
      const result = await adminModel.updateAdmin(parsedId.data, {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone ?? '',
        location: parsed.data.location,
        isActive: parsed.data.isActive,
        ...(passwordHash ? { passwordHash } : {}),
      });

      if (result.kind === 'not_found') {
        return response.status(404).json({
          error: {
            code: 'ADMIN_NOT_FOUND',
            message: 'Admin account not found',
          },
        });
      }

      if (result.kind === 'email_exists') {
        return response.status(409).json({
          error: {
            code: 'ADMIN_EMAIL_EXISTS',
            message: 'An admin account with this email already exists',
          },
        });
      }

      return response.status(200).json({
        success: true,
        data: { admin: safeAdmin(result.admin) },
      });
    },

    remove: async (request, response) => {
      const parsedId = adminIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return response.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid admin id',
          },
        });
      }

      const deleted = await adminModel.deleteAdmin(parsedId.data);
      if (!deleted) {
        return response.status(404).json({
          error: {
            code: 'ADMIN_NOT_FOUND',
            message: 'Admin account not found',
          },
        });
      }

      return response.status(204).end();
    },

    deactivate: async (request, response) => {
      const parsedId = adminIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return response.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid admin id',
          },
        });
      }

      const admin = await adminModel.deactivateAdmin(parsedId.data);
      if (!admin) {
        return response.status(404).json({
          error: {
            code: 'ADMIN_NOT_FOUND',
            message: 'Active admin account not found',
          },
        });
      }

      return response.status(200).json({
        success: true,
        data: { admin: safeAdmin(admin) },
      });
    },
  };
}
