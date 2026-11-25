import { createAdminCarsController } from '../controllers/adminCarsController.js';
import { createCarController } from '../controllers/carController.js';
import {
  createRequireAdmin,
  createRequireTrustedOrigin,
} from '../middleware/admin-auth.js';

export function registerAdminCarsRoutes(app, { carModel, adminModel, allowedOrigins }) {
  const readController = createCarController(carModel, { allowArchived: true });
  const writeController = createAdminCarsController(carModel);
  const requireAdmin = createRequireAdmin(adminModel);
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);

  app.get('/api/admin/cars', requireAdmin, readController.list);
  app.get('/api/admin/cars/:id', requireAdmin, readController.getById);
  app.post(
    '/api/admin/cars',
    requireTrustedOrigin,
    requireAdmin,
    writeController.create,
  );
  app.put(
    '/api/admin/cars/:id',
    requireTrustedOrigin,
    requireAdmin,
    writeController.update,
  );
  app.delete(
    '/api/admin/cars/:id/permanent',
    requireTrustedOrigin,
    requireAdmin,
    writeController.permanentlyDelete,
  );
  app.delete(
    '/api/admin/cars/:id',
    requireTrustedOrigin,
    requireAdmin,
    writeController.archive,
  );
  app.patch(
    '/api/admin/cars/:id/restore',
    requireTrustedOrigin,
    requireAdmin,
    writeController.restore,
  );
}
