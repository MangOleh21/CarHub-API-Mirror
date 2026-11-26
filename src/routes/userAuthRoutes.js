import rateLimit from 'express-rate-limit';
import { createUserAuthController } from '../controllers/userAuthController.js';
import { createRequireTrustedOrigin } from '../middleware/admin-auth.js';
import { createRequireUser } from '../middleware/user-auth.js';

function createAuthRateLimiter(message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message,
      },
    }),
  });
}

export function registerUserAuthRoutes(app, { userModel, allowedOrigins }) {
  const controller = createUserAuthController(userModel);
  const requireUser = createRequireUser(userModel);
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);
  const registerLimiter = createAuthRateLimiter('Too many registration attempts; try again later');
  const loginLimiter = createAuthRateLimiter('Too many login attempts; try again later');

  app.post(
    '/api/auth/register',
    requireTrustedOrigin,
    registerLimiter,
    controller.register,
  );
  app.post(
    '/api/auth/login',
    requireTrustedOrigin,
    loginLimiter,
    controller.login,
  );
  app.get('/api/auth/session', requireUser, controller.getSession);
  app.post('/api/auth/logout', requireTrustedOrigin, controller.logout);
  app.get('/api/me', requireUser, controller.getProfile);
  app.patch('/api/me', requireTrustedOrigin, requireUser, controller.updateProfile);
  app.get('/api/me/listings', requireUser, controller.listListings);
}
