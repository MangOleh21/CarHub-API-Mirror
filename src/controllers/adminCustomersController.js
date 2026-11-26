import { z } from 'zod';
import { hashPassword } from '../auth/password.js';

const phoneSchema = z.string().trim().regex(/^\+?[0-9][0-9\s()-]{7,19}$/);
const optionalLocationSchema = z.string().trim().max(150).nullable().optional()
  .transform((value) => (value && value.length > 0 ? value : null));
const optionalSearchSchema = z.string().trim().max(100).optional()
  .transform((value) => value || undefined);

const listQuerySchema = z.object({
  search: optionalSearchSchema,
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const userIdSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254),
  phone: phoneSchema,
  location: optionalLocationSchema,
  password: z.string().min(8).max(128),
  isActive: z.boolean().default(true),
}).strict();

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254),
  phone: phoneSchema,
  location: optionalLocationSchema,
  isActive: z.boolean(),
  password: z.string().min(8).max(128).optional(),
}).strict();

function safeCustomer(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    location: user.location ?? null,
    isActive: user.isActive,
    ...(user.createdAt ? { createdAt: user.createdAt } : {}),
  };
}

function validationError(response, error, message) {
  return response.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details: error.flatten().fieldErrors,
    },
  });
}

function notFound(response) {
  return response.status(404).json({
    error: {
      code: 'USER_NOT_FOUND',
      message: 'User account not found',
    },
  });
}

export function createAdminCustomersController(userModel) {
  return {
    list: async (request, response) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid user filters');
      }

      const { search, status, page, pageSize } = parsed.data;
      const result = await userModel.listUsers({
        search,
        status,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return response.status(200).json({
        success: true,
        data: result.items.map(safeCustomer),
        pagination: {
          page,
          pageSize,
          totalItems: result.totalItems,
          totalPages: Math.ceil(result.totalItems / pageSize),
        },
      });
    },

    getById: async (request, response) => {
      const parsedId = userIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return validationError(response, parsedId.error, 'Invalid user id');
      }

      const user = await userModel.findById(parsedId.data);
      if (!user) return notFound(response);

      return response.status(200).json({
        success: true,
        data: safeCustomer(user),
      });
    },

    create: async (request, response) => {
      const parsed = createCustomerSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid user data');
      }

      const user = await userModel.create({
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone,
        location: parsed.data.location,
        isActive: parsed.data.isActive,
        passwordHash: await hashPassword(parsed.data.password),
      });

      if (!user) {
        return response.status(409).json({
          error: {
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'An account with this email already exists',
          },
        });
      }

      return response.status(201).json({
        success: true,
        data: safeCustomer(user),
      });
    },

    update: async (request, response) => {
      const parsedId = userIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return validationError(response, parsedId.error, 'Invalid user id');
      }

      const parsed = updateCustomerSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid user data');
      }

      const passwordHash = parsed.data.password
        ? await hashPassword(parsed.data.password)
        : undefined;
      const result = await userModel.updateByAdmin(parsedId.data, {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone,
        location: parsed.data.location,
        isActive: parsed.data.isActive,
        ...(passwordHash ? { passwordHash } : {}),
      });

      if (result.kind === 'not_found') return notFound(response);
      if (result.kind === 'email_exists') {
        return response.status(409).json({
          error: {
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'An account with this email already exists',
          },
        });
      }

      return response.status(200).json({
        success: true,
        data: safeCustomer(result.user),
      });
    },

    remove: async (request, response) => {
      const parsedId = userIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return validationError(response, parsedId.error, 'Invalid user id');
      }

      const deleted = await userModel.deleteById(parsedId.data);
      if (!deleted) return notFound(response);

      return response.status(204).end();
    },
  };
}
