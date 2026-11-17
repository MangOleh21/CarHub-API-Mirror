import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { parseAllowedOrigins } from './config/origins.js';
import { registerAdminAuthRoutes } from './routes/admin-auth.js';
import { registerAdminUserRoutes } from './routes/admin-users.js';
import { registerPublicRoutes } from './routes/public.js';

export function createApp({
  carRepository,
  submissionRepository,
  adminRepository,
  allowedOrigins = parseAllowedOrigins(),
  logger = console,
} = {}) {
  const app = express();

  if (!carRepository || !submissionRepository || !adminRepository) {
    throw new Error('Car, submission, and admin repositories are required');
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

  registerPublicRoutes(app, { carRepository, submissionRepository });
  registerAdminAuthRoutes(app, { adminRepository, allowedOrigins });
  registerAdminUserRoutes(app, { adminRepository, allowedOrigins });

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

    logger.error('API request failed', {
      path: request.path,
      errorName: error.name,
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
