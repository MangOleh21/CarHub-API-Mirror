import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  createSessionToken,
  getUserSessionCookieOptions,
  hashSessionToken,
  userSessionCookieName,
  userSessionDurationMs,
} from '../auth/session-cookie.js';

const phoneSchema = z.string().trim().regex(/^\+?[0-9][0-9\s()-]{7,19}$/);
const optionalLocationSchema = z.string().trim().max(150).nullable().optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const registerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254),
  phone: phoneSchema,
  location: optionalLocationSchema,
  password: z.string().min(8).max(128),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  phone: phoneSchema,
  location: optionalLocationSchema,
  newPassword: z.string().min(8).max(128).optional(),
}).strict();

const listingsQuerySchema = z.object({
  status: z.enum(['all', 'active', 'pending', 'rejected']).default('all'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const dummyPasswordHash = await hashPassword('not-a-real-user-password');

function validationError(response, error, message) {
  return response.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details: error.flatten().fieldErrors,
    },
  });
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    location: user.location ?? null,
    ...(user.createdAt ? { createdAt: user.createdAt } : {}),
  };
}

export function createUserAuthController(userModel) {
  return {
    register: async (request, response) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid registration data');
      }

      const email = parsed.data.email.toLowerCase();
      const passwordHash = await hashPassword(parsed.data.password);
      const user = await userModel.create({
        name: parsed.data.name,
        email,
        phone: parsed.data.phone,
        location: parsed.data.location,
        passwordHash,
      });

      if (!user) {
        return response.status(409).json({
          error: {
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'An account with this email already exists',
          },
        });
      }

      const token = createSessionToken();
      await userModel.createSession({
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + userSessionDurationMs),
      });

      response.cookie(userSessionCookieName, token, getUserSessionCookieOptions());
      return response.status(201).json({
        success: true,
        data: { user: safeUser(user) },
      });
    },

    login: async (request, response) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid login data');
      }

      const email = parsed.data.email.toLowerCase();
      const user = await userModel.findByEmail(email);
      const passwordMatches = await verifyPassword(
        parsed.data.password,
        user?.passwordHash ?? dummyPasswordHash,
      );

      if (!user || !user.isActive || !passwordMatches) {
        return response.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Email or password is incorrect',
          },
        });
      }

      const token = createSessionToken();
      await userModel.createSession({
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + userSessionDurationMs),
      });

      response.cookie(userSessionCookieName, token, getUserSessionCookieOptions());
      return response.status(200).json({
        success: true,
        data: { user: safeUser(user) },
      });
    },

    getSession: (request, response) => {
      return response.status(200).json({
        success: true,
        data: { user: safeUser(request.user) },
      });
    },

    logout: async (request, response) => {
      const token = request.cookies[userSessionCookieName];
      if (token) {
        await userModel.revokeSession(hashSessionToken(token));
      }

      response.clearCookie(userSessionCookieName, getUserSessionCookieOptions());
      return response.status(204).end();
    },

    getProfile: (request, response) => {
      return response.status(200).json({
        success: true,
        data: { user: safeUser(request.user) },
      });
    },

    updateProfile: async (request, response) => {
      const parsed = updateProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid profile data');
      }

      const passwordHash = parsed.data.newPassword
        ? await hashPassword(parsed.data.newPassword)
        : undefined;

      const updated = await userModel.updateProfile(request.user.id, {
        name: parsed.data.name,
        phone: parsed.data.phone,
        location: parsed.data.location,
        ...(passwordHash ? { passwordHash } : {}),
      });
      if (!updated) {
        return response.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      return response.status(200).json({
        success: true,
        data: { user: safeUser(updated) },
      });
    },

    listListings: async (request, response) => {
      const parsed = listingsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid listings query');
      }

      const { status, page, pageSize } = parsed.data;
      const result = await userModel.listListingsByUser({
        userId: request.user.id,
        status,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return response.status(200).json({
        success: true,
        data: result.items,
        pagination: {
          page,
          pageSize,
          totalItems: result.totalItems,
          totalPages: Math.ceil(result.totalItems / pageSize),
        },
      });
    },
  };
}
