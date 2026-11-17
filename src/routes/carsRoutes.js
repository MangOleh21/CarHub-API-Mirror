import { createCarController } from '../controllers/carController.js';

export function registerCarRoutes(app, { carModel }) {
  const controller = createCarController(carModel);
  app.get('/api/cars', controller.list);
  app.get('/api/cars/:id', controller.getById);
}
