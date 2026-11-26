import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { parseAllowedOrigins } from './config/origins.js';
import { createPool } from './config/pool.js';
import { createAdminsModel } from './models/adminsModel.js';
import { createCarsModel } from './models/carsModel.js';
import { createSubmissionsModel } from './models/submissionsModel.js';
import { createUsersModel } from './models/usersModel.js';
import { registerAdminAuthRoutes } from './routes/adminAuthRoutes.js';
import { registerAdminCarsRoutes } from './routes/adminCarsRoutes.js';
import { registerAdminCustomersRoutes } from './routes/adminCustomersRoutes.js';
import { registerAdminSubmissionsRoutes } from './routes/adminSubmissionsRoutes.js';
import { registerAdminUsersRoutes } from './routes/adminUsersRoutes.js';
import { registerCarRoutes } from './routes/carsRoutes.js';
import { registerImageUploadRoutes } from './routes/imageUploadRoutes.js';
import { registerSubmissionRoutes } from './routes/submissionsRoutes.js';
import { registerUserAuthRoutes } from './routes/userAuthRoutes.js';
import { createImageUpload } from './services/image-upload.js';

const defaultUserModel = {
  async findByEmail() { return null; },
  async findById() { return null; },
  async create() { return null; },
  async updateProfile() { return null; },
  async listUsers() { return { items: [], totalItems: 0 }; },
  async updateByAdmin() { return { kind: 'not_found' }; },
  async deleteById() { return null; },
  async listListingsByUser() { return { items: [], totalItems: 0 }; },
  async createSession() {},
  async getActiveSession() { return null; },
  async revokeSession() {},
};

export function createApp({
  carModel,
  submissionModel,
  adminModel,
  userModel = defaultUserModel,
  allowedOrigins = parseAllowedOrigins(),
  logger = console,
  imageUploadService = createImageUpload,
} = {}) {
  const app = express();

  if (!carModel || !submissionModel || !adminModel) {
    throw new Error('Car, submission, and admin models are required');
  }

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      callback(null, Boolean(origin && allowedOrigins.includes(origin)));
    },
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  registerCarRoutes(app, { carModel });
  registerAdminCarsRoutes(app, { carModel, adminModel, allowedOrigins });
  registerSubmissionRoutes(app, { submissionModel, userModel, allowedOrigins });
  registerUserAuthRoutes(app, { userModel, allowedOrigins });
  registerAdminAuthRoutes(app, { adminModel, allowedOrigins });
  registerAdminCustomersRoutes(app, { userModel, adminModel, allowedOrigins });
  registerAdminSubmissionsRoutes(app, { submissionModel, adminModel, allowedOrigins });
  registerAdminUsersRoutes(app, { adminModel, allowedOrigins });
  registerImageUploadRoutes(app, { adminModel, allowedOrigins, imageUploadService });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    });
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      return next(error);
    }

    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON',
        },
      });
    }

    if (error.type === 'entity.too.large') {
      return response.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body is too large',
        },
      });
    }

    const errorCode = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : undefined;
    const errorClass = typeof error?.constructor?.name === 'string'
      && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.constructor.name)
      ? error.constructor.name
      : 'Error';

    logger.error('API request failed', {
      path: request.path,
      errorName: error.name,
      errorClass,
      ...(errorCode ? { errorCode } : {}),
    });
    return response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  return app;
}

let vercelApp;

export default function vercelHandler(request, response) {
  if (!vercelApp) {
    const pool = createPool();
    vercelApp = createApp({
      carModel: createCarsModel(pool),
      submissionModel: createSubmissionsModel(pool),
      adminModel: createAdminsModel(pool),
      userModel: createUsersModel(pool),
      allowedOrigins: parseAllowedOrigins(),
    });
  }

  return vercelApp(request, response);
}
