import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  createSessionToken,
  getSessionCookieOptions,
  getUserSessionCookieOptions,
  hashSessionToken,
  sessionCookieName,
  userSessionCookieName,
  userSessionDurationMs,
} from '../auth/session-cookie.js';

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
}).strict();

const dummyPasswordHash = await hashPassword('not-a-real-admin-password');

function validationError(response, error) {
  return response.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid login data',
      details: error.flatten().fieldErrors,
    },
  });
}

function safeAdmin(admin) {
  return {
    id: admin.id,
    ...(admin.name ? { name: admin.name } : {}),
    email: admin.email,
    role: admin.role,
  };
}

export function createAdminAuthController(adminModel) {
  return {
    login: async (request, response) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error);
      }

      const email = parsed.data.email.toLowerCase();
      const admin = await adminModel.findUserByEmail(email);
      const isAdminRole = admin?.role === 'admin' || admin?.role === 'owner';
      const passwordMatches = await verifyPassword(
        parsed.data.password,
        admin?.passwordHash ?? dummyPasswordHash,
      );

      if (!admin || !admin.isActive || !isAdminRole || !passwordMatches) {
        return response.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Email or password is incorrect',
          },
        });
      }

      const token = createSessionToken();
      await adminModel.createSession({
        adminUserId: admin.id,
        userId: admin.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + userSessionDurationMs),
      });

      response.cookie(userSessionCookieName, token, getUserSessionCookieOptions());
      return response.status(200).json({
        success: true,
        data: { admin: safeAdmin(admin) },
      });
    },

    getSession: (request, response) => {
      return response.status(200).json({
        success: true,
        data: { admin: safeAdmin(request.admin) },
      });
    },

    logout: async (request, response) => {
      const token = request.cookies[userSessionCookieName] ?? request.cookies[sessionCookieName];
      if (token) {
        await adminModel.revokeSession(hashSessionToken(token));
      }

      response.clearCookie(userSessionCookieName, getUserSessionCookieOptions());
      response.clearCookie(sessionCookieName, getSessionCookieOptions());
      return response.status(204).end();
    },
  };
}
