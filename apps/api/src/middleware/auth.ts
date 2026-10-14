import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../utils/errors.js';
import { verifyToken, type TokenPayload } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      companyId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication credentials were not provided.');
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token, 'access');
    req.user = payload;
    req.companyId = payload.company_id;
    next();
  } catch (err: any) {
    throw new UnauthorizedError('Given token not valid for any token type');
  }
}
