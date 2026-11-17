import { createAdminSubmissionsController } from '../controllers/adminSubmissionsController.js';
import {
  createRequireAdmin,
  createRequireTrustedOrigin,
} from '../middleware/admin-auth.js';

export function registerAdminSubmissionsRoutes(app, { submissionModel, adminModel, allowedOrigins }) {
  const controller = createAdminSubmissionsController(submissionModel);
  const requireAdmin = createRequireAdmin(adminModel);
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);

  app.get('/api/admin/submissions', requireAdmin, controller.list);
  app.patch(
    '/api/admin/submissions/:id/status',
    requireTrustedOrigin,
    requireAdmin,
    controller.moderate,
  );
}
