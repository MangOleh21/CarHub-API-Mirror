import { createAdminUsersController } from '../controllers/adminUsersController.js';
import {
  createRequireAdmin,
  createRequireTrustedOrigin,
  requireOwner,
} from '../middleware/admin-auth.js';

export function registerAdminUsersRoutes(app, { adminModel, allowedOrigins }) {
  const controller = createAdminUsersController(adminModel);
  const requireAdmin = createRequireAdmin(adminModel);
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);

  app.get(
    '/api/admin/users',
    requireAdmin,
    requireOwner,
    controller.list,
  );
  app.post(
    '/api/admin/users',
    requireTrustedOrigin,
    requireAdmin,
    requireOwner,
    controller.create,
  );
  app.put(
    '/api/admin/users/:id',
    requireTrustedOrigin,
    requireAdmin,
    requireOwner,
    controller.update,
  );
  app.delete(
    '/api/admin/users/:id',
    requireTrustedOrigin,
    requireAdmin,
    requireOwner,
    controller.remove,
  );
  app.patch(
    '/api/admin/users/:id/deactivate',
    requireTrustedOrigin,
    requireAdmin,
    requireOwner,
    controller.deactivate,
  );
}
