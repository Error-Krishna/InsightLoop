import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../utils/errors.js';
import { verifyToken } from '../utils/jwt.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication credentials were not provided.');
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token, 'access');
    req.user = payload;
    req.companyId = payload.company_id;
    next();
  } catch {
    throw new UnauthorizedError('Given token not valid for any token type');
  }
}
