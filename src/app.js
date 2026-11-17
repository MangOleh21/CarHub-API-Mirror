import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { parseAllowedOrigins } from './config/origins.js';
import { registerAdminAuthRoutes } from './routes/adminAuthRoutes.js';
import { registerAdminSubmissionsRoutes } from './routes/adminSubmissionsRoutes.js';
import { registerAdminUsersRoutes } from './routes/adminUsersRoutes.js';
import { registerCarRoutes } from './routes/carsRoutes.js';
import { registerSubmissionRoutes } from './routes/submissionsRoutes.js';

export function createApp({
  carModel,
  submissionModel,
  adminModel,
  allowedOrigins = parseAllowedOrigins(),
  logger = console,
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
  registerSubmissionRoutes(app, { submissionModel });
  registerAdminAuthRoutes(app, { adminModel, allowedOrigins });
  registerAdminSubmissionsRoutes(app, { submissionModel, adminModel, allowedOrigins });
  registerAdminUsersRoutes(app, { adminModel, allowedOrigins });

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

    logger.error('API request failed', {
      path: request.path,
      errorName: error.name,
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
