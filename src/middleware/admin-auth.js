import { hashSessionToken, userSessionCookieName } from '../auth/session-cookie.js';

function unauthorized(response) {
  return response.status(401).json({
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Admin authentication is required',
    },
  });
}

function forbidden(response, message = 'Admin permission is required') {
  return response.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message,
    },
  });
}

export function createRequireAdmin(adminModel) {
  return async (request, response, next) => {
    const token = request.cookies[userSessionCookieName];
    if (!token) {
      return unauthorized(response);
    }

    const account = await adminModel.getActiveSession(hashSessionToken(token));
    if (!account) {
      return unauthorized(response);
    }

    if (account.role !== 'admin' && account.role !== 'owner') {
      return forbidden(response);
    }

    request.admin = account;
    return next();
  };
}

export function requireOwner(request, response, next) {
  if (request.admin?.role !== 'owner') {
    return forbidden(response, 'Owner permission is required');
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
