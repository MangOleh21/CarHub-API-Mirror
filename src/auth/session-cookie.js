import { createHash, randomBytes } from 'node:crypto';

export const sessionCookieName = 'carhub_admin_session';
export const sessionDurationMs = 8 * 60 * 60 * 1000;

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function getSessionCookieOptions(environment = process.env) {
  const sameSite = (environment.ADMIN_COOKIE_SAME_SITE ?? 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('ADMIN_COOKIE_SAME_SITE must be lax, strict, or none');
  }

  const secure = environment.NODE_ENV === 'production'
    || environment.ADMIN_COOKIE_SECURE === 'true';
  if (sameSite === 'none' && !secure) {
    throw new Error('Secure cookies are required when ADMIN_COOKIE_SAME_SITE is none');
  }

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/admin',
    maxAge: sessionDurationMs,
  };
}
