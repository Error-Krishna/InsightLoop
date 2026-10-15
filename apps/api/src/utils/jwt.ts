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

export function generateTokens(
  user: { _id: { toString(): string }; email: string; name: string },
  companyId: string
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

  const access = jwt.sign(accessPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    algorithm: 'HS256',
  });

  const refresh = jwt.sign(refreshPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    algorithm: 'HS256',
  });

  return { access, refresh };
}

export function verifyToken(token: string, expectedType: 'access' | 'refresh'): TokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as unknown as TokenPayload;

    if (payload.token_type !== expectedType) {
      throw new UnauthorizedError('Token is invalid or expired', 'token_not_valid');
    }

    return payload;
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired', 'token_expired');
    }
    throw new UnauthorizedError('Token is invalid', 'token_not_valid');
  }
}

export function verifyAccessToken(token: string): TokenPayload {
  return verifyToken(token, 'access');
}

export function verifyRefreshToken(token: string): TokenPayload {
  return verifyToken(token, 'refresh');
}
