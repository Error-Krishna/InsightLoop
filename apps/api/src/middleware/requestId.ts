import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const reqId = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId.trim()
    : crypto.randomUUID();

  req.id = reqId;
  req.requestId = reqId;
  res.setHeader('X-Request-ID', reqId);

  // Structured log with requestId
  logger.info({ requestId: reqId, method: req.method, url: req.url }, 'Incoming request');

  next();
}
