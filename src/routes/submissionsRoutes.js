import { createSubmissionController } from '../controllers/submissionController.js';

export function registerSubmissionRoutes(app, { submissionModel }) {
  app.post('/api/submissions', createSubmissionController(submissionModel));
}
