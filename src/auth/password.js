import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const saltLength = 16;
const parameters = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(saltLength);
  const key = await scrypt(password, salt, keyLength, parameters);

  return [
    'scrypt',
    parameters.N,
    parameters.r,
    parameters.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password, encodedHash) {
  const [algorithm, n, r, p, encodedSalt, encodedKey, ...extra] = encodedHash.split('$');
  if (
    algorithm !== 'scrypt'
    || n !== String(parameters.N)
    || r !== String(parameters.r)
    || p !== String(parameters.p)
    || extra.length > 0
  ) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, 'base64url');
  const expectedKey = Buffer.from(encodedKey, 'base64url');
  if (salt.length !== saltLength || expectedKey.length !== keyLength) {
    return false;
  }

  const actualKey = await scrypt(password, salt, keyLength, parameters);
  return timingSafeEqual(actualKey, expectedKey);
}
