import { z } from 'zod';
import { hashPassword } from '../auth/password.js';

const createAdminSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
}).strict();

const adminIdSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);

function safeAdmin(admin) {
  return {
    id: admin.id,
    email: admin.email,
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
