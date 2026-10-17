import type { TokenPayload } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      requestId?: string;
      user?: TokenPayload;
      companyId?: string;
    }
  }
}

export {};
