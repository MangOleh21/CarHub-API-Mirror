import { hashSessionToken, sessionCookieName } from '../auth/session-cookie.js';

function unauthorized(response) {
  return response.status(401).json({
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Admin authentication is required',
    },
  });
}

export function createRequireAdmin(adminRepository) {
  return async (request, response, next) => {
    const token = request.cookies[sessionCookieName];
    if (!token) {
      return unauthorized(response);
    }

    const admin = await adminRepository.getActiveSession(hashSessionToken(token));
    if (!admin) {
      return unauthorized(response);
    }

    request.admin = admin;
    return next();
  };
}

export function requireOwner(request, response, next) {
  if (request.admin?.role !== 'owner') {
    return response.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Owner permission is required',
      },
    });
  }

  return next();
}

export function createRequireTrustedOrigin(allowedOrigins) {
  return (request, response, next) => {
    if (!allowedOrigins.includes(request.get('origin'))) {
      return response.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Request origin is not allowed',
        },
      });
    }

    return next();
  };
}
