import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  createSessionToken,
  getSessionCookieOptions,
  hashSessionToken,
  sessionCookieName,
  sessionDurationMs,
} from '../auth/session-cookie.js';
import {
  createRequireAdmin,
  createRequireTrustedOrigin,
} from '../middleware/admin-auth.js';

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
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
    email: admin.email,
    role: admin.role,
  };
}

export function registerAdminAuthRoutes(app, { adminRepository, allowedOrigins }) {
  const requireAdmin = createRequireAdmin(adminRepository);
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many login attempts; try again later',
      },
    }),
  });

  app.post(
    '/api/admin/auth/login',
    requireTrustedOrigin,
    loginLimiter,
    async (request, response) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error);
      }

      const email = parsed.data.email.toLowerCase();
      const admin = await adminRepository.findUserByEmail(email);
      const passwordMatches = await verifyPassword(
        parsed.data.password,
        admin?.passwordHash ?? dummyPasswordHash,
      );

      if (!admin || !admin.isActive || !passwordMatches) {
        return response.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Email or password is incorrect',
          },
        });
      }

      const token = createSessionToken();
      const tokenHash = hashSessionToken(token);
      await adminRepository.createSession({
        adminUserId: admin.id,
        tokenHash,
        expiresAt: new Date(Date.now() + sessionDurationMs),
      });

      response.cookie(sessionCookieName, token, getSessionCookieOptions());
      return response.status(200).json({
        success: true,
        data: { admin: safeAdmin(admin) },
      });
    },
  );

  app.get('/api/admin/auth/session', requireAdmin, (request, response) => {
    return response.status(200).json({
      success: true,
      data: { admin: safeAdmin(request.admin) },
    });
  });

  app.post('/api/admin/auth/logout', requireTrustedOrigin, async (request, response) => {
    const token = request.cookies[sessionCookieName];
    if (token) {
      await adminRepository.revokeSession(hashSessionToken(token));
    }

    response.clearCookie(sessionCookieName, getSessionCookieOptions());
    return response.status(204).end();
  });

  return { requireAdmin };
}
