import rateLimit from 'express-rate-limit';
import { createImageUploadController } from '../controllers/imageUploadController.js';
import { createRequireAdmin, createRequireTrustedOrigin } from '../middleware/admin-auth.js';

export function registerImageUploadRoutes(app, {
  adminModel,
  allowedOrigins,
  imageUploadService,
}) {
  const requireAdmin = createRequireAdmin(adminModel);
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);
  const submissionUploadLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many image upload requests; try again later',
      },
    }),
  });

  app.post(
    '/api/uploads/submissions',
    requireTrustedOrigin,
    submissionUploadLimit,
    createImageUploadController(imageUploadService, 'submissions'),
  );
  app.post(
    '/api/admin/uploads/cars',
    requireTrustedOrigin,
    requireAdmin,
    createImageUploadController(imageUploadService, 'cars'),
  );
}
