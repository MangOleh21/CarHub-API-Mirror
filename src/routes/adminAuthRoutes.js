import rateLimit from 'express-rate-limit';
import { createAdminAuthController } from '../controllers/adminAuthController.js';
import {
  createRequireAdmin,
  createRequireTrustedOrigin,
} from '../middleware/admin-auth.js';

export function registerAdminAuthRoutes(app, { adminModel, allowedOrigins }) {
  const controller = createAdminAuthController(adminModel);
  const requireAdmin = createRequireAdmin(adminModel);
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
    controller.login,
  );
  app.get('/api/admin/auth/session', requireAdmin, controller.getSession);
  app.post('/api/admin/auth/logout', requireTrustedOrigin, controller.logout);
}
