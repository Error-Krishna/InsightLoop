import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from './errors.js';

export interface TokenPayload {
  token_type: 'access' | 'refresh';
  user_id: string;
  email: string;
  company_id: string;
  name: string;
  jti: string;
  iat?: number;
  exp?: number;
}

/**
 * Derives the signing key in exact accordance with Django simplejwt:
 * If secret length >= 32, use secret as-is.
 * If secret length < 32, use sha256(secret).hexdigest().
 */
export function deriveSigningKey(secret = env.JWT_SECRET): string {
  if (secret.length >= 32) {
    return secret;
  }
  return crypto.createHash('sha256').update(secret, 'utf-8').digest('hex');
}

export function generateTokens(
  user: { _id: { toString(): string }; email: string; name: string },
  companyId: string,
  secret = env.JWT_SECRET
) {
  const userIdStr = user._id.toString();
  const jtiAccess = crypto.randomUUID().replace(/-/g, '');
  const jtiRefresh = crypto.randomUUID().replace(/-/g, '');

  const accessPayload: TokenPayload = {
    token_type: 'access',
    user_id: userIdStr,
    email: user.email,
    company_id: companyId,
    name: user.name,
    jti: jtiAccess,
  };

  const refreshPayload: TokenPayload = {
    token_type: 'refresh',
    user_id: userIdStr,
    email: user.email,
    company_id: companyId,
    name: user.name,
    jti: jtiRefresh,
  };

  const key = deriveSigningKey(secret);

  const access = jwt.sign(accessPayload, key, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    algorithm: 'HS256',
  });

  const refresh = jwt.sign(refreshPayload, key, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    algorithm: 'HS256',
  });

  return { access, refresh };
}

export function verifyToken(
  token: string,
  expectedType: 'access' | 'refresh',
  secret = env.JWT_SECRET
): TokenPayload {
  try {
    const key = deriveSigningKey(secret);
    const payload = jwt.verify(token, key, {
      algorithms: ['HS256'],
    }) as unknown as TokenPayload;

    if (payload.token_type !== expectedType) {
      throw new UnauthorizedError('Token is invalid or expired', 'token_not_valid');
    }

    return payload;
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Token is invalid or expired', 'token_not_valid');
  }
}

export function verifyAccessToken(token: string, secret = env.JWT_SECRET): TokenPayload {
  return verifyToken(token, 'access', secret);
}

export function verifyRefreshToken(token: string, secret = env.JWT_SECRET): TokenPayload {
  return verifyToken(token, 'refresh', secret);
}
