import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.id ?? req.requestId ?? 'unknown';
  res.status(404).json({
    detail: 'Not found.',
    code: 'NOT_FOUND',
    requestId,
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
   
  _next: NextFunction
): void {
  const requestId = req.id ?? req.requestId ?? 'unknown';

  if (err instanceof AppError) {
    const responsePayload: Record<string, unknown> = {
      detail: err.detail,
    };

    if (err.code) {
      responsePayload.code = err.code;
    }

    if (err.missing && err.missing.length > 0) {
      responsePayload.missing = err.missing;
    }
    if (err.errors) {
      responsePayload.errors = err.errors;
    }

    if (err.statusCode >= 500) {
      logger.error({ requestId, err }, err.detail);
    }

    res.status(err.statusCode).json(responsePayload);
    return;
  }

  const standardError = err instanceof Error ? err : new Error(String(err));
  logger.error({ requestId, err: standardError }, standardError.message);

  const payload: Record<string, unknown> = {
    detail: env.NODE_ENV === 'production' ? 'Internal Server Error' : standardError.message,
    code: 'INTERNAL_SERVER_ERROR',
    requestId,
  };

  res.status(500).json(payload);
}
