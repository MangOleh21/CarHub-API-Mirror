import { hashSessionToken, userSessionCookieName } from '../auth/session-cookie.js';

function unauthorized(response) {
  return response.status(401).json({
    error: {
      code: 'UNAUTHENTICATED',
      message: 'User authentication is required',
    },
  });
}

export function createRequireUser(userModel) {
  return async (request, response, next) => {
    const token = request.cookies[userSessionCookieName];
    if (!token) {
      return unauthorized(response);
    }

    const user = await userModel.getActiveSession(hashSessionToken(token));
    if (!user) {
      return unauthorized(response);
    }

    request.user = user;
    return next();
  };
}
