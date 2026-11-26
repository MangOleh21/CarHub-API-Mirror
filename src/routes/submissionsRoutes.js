import { createSubmissionController } from '../controllers/submissionController.js';
import { createRequireTrustedOrigin } from '../middleware/admin-auth.js';
import { createRequireUser } from '../middleware/user-auth.js';

export function registerSubmissionRoutes(app, { submissionModel, userModel, allowedOrigins }) {
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);
  const requireUser = createRequireUser(userModel);

  app.post(
    '/api/submissions',
    requireTrustedOrigin,
    requireUser,
    createSubmissionController(submissionModel),
  );
}
