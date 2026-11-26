import { createAdminCustomersController } from '../controllers/adminCustomersController.js';
import {
  createRequireAdmin,
  createRequireTrustedOrigin,
} from '../middleware/admin-auth.js';

export function registerAdminCustomersRoutes(app, { userModel, adminModel, allowedOrigins }) {
  const controller = createAdminCustomersController(userModel);
  const requireAdmin = createRequireAdmin(adminModel);
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);

  app.get('/api/admin/customers', requireAdmin, controller.list);
  app.get('/api/admin/customers/:id', requireAdmin, controller.getById);
  app.post(
    '/api/admin/customers',
    requireTrustedOrigin,
    requireAdmin,
    controller.create,
  );
  app.put(
    '/api/admin/customers/:id',
    requireTrustedOrigin,
    requireAdmin,
    controller.update,
  );
  app.delete(
    '/api/admin/customers/:id',
    requireTrustedOrigin,
    requireAdmin,
    controller.remove,
  );
}
