import crypto from 'node:crypto';

const DEFAULT_ITERATIONS = 600000;
const ALGORITHM = 'pbkdf2_sha256';

/**
 * Verifies a plain password against a Django-formatted PBKDF2 hash:
 * pbkdf2_sha256$<iterations>$<salt>$<hash>
 */
export function verifyPassword(password: string, djangoHash: string): boolean {
  if (!djangoHash || !password) return false;
  const parts = djangoHash.split('$');
  if (parts.length !== 4) return false;

  const [algorithm, iterationsStr, salt, expectedHash] = parts;
  if (algorithm !== 'pbkdf2_sha256') {
    return false;
  }

  const iterations = parseInt(iterationsStr, 10);
  if (isNaN(iterations) || iterations <= 0) {
    return false;
  }

  const calculatedKey = crypto
    .pbkdf2Sync(password, salt, iterations, 32, 'sha256')
    .toString('base64');

  const expectedBuffer = Buffer.from(expectedHash, 'utf-8');
  const calculatedBuffer = Buffer.from(calculatedKey, 'utf-8');

  if (expectedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, calculatedBuffer);
}

/**
 * Hashes a plain password using Django's exact pbkdf2_sha256 format.
 */
export function hashPassword(password: string): string {
  // Generate a 16-character alphanumeric salt
  const salt = crypto.randomBytes(12).toString('base64').replace(/\+/g, '.').slice(0, 16);
  const hash = crypto
    .pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, 32, 'sha256')
    .toString('base64');

  return `${ALGORITHM}$${DEFAULT_ITERATIONS}$${salt}$${hash}`;
}
