import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
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
  const isProd = process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production';

  // 1. AppError subclasses
  if (err instanceof AppError) {
    const payload: Record<string, unknown> = {
      detail: err.detail,
      code: err.code || 'APP_ERROR',
      requestId,
    };

    if (err.missing && err.missing.length > 0) {
      payload.missing = err.missing;
    }
    if (err.errors) {
      payload.errors = err.errors;
    }

    if (err.statusCode >= 500) {
      logger.error({ requestId, err }, err.detail);
    }

    res.status(err.statusCode).json(payload);
    return;
  }

  // 2. Zod validation errors
  if (err instanceof ZodError || (err && typeof err === 'object' && (err as { name?: string }).name === 'ZodError')) {
    const zodErr = err as ZodError;
    res.status(400).json({
      detail: 'Invalid request data.',
      code: 'VALIDATION_ERROR',
      errors: zodErr.errors,
      requestId,
    });
    return;
  }

  // 3. Mongo Duplicate Key errors (code 11000)
  const anyErr = err as Record<string, unknown>;
  if (anyErr && (anyErr.code === 11000 || anyErr.code === '11000')) {
    const errMsg = String(anyErr.message || '');
    const keyPattern = (anyErr.keyPattern && typeof anyErr.keyPattern === 'object')
      ? (anyErr.keyPattern as { email?: unknown; invoice_number?: unknown; sku?: unknown })
      : undefined;
    let detail = 'Duplicate entry error.';
    if (errMsg.includes('email') || Boolean(keyPattern?.email)) {
      detail = 'Email already registered.';
    } else if (errMsg.includes('invoice_number') || Boolean(keyPattern?.invoice_number)) {
      detail = 'Invoice number already exists.';
    } else if (errMsg.includes('sku') || Boolean(keyPattern?.sku)) {
      detail = 'SKU already exists.';
    }

    res.status(400).json({
      detail,
      code: 'DUPLICATE_KEY',
      requestId,
    });
    return;
  }

  // 4. JWT verification / expiration errors
  if (anyErr?.name === 'JsonWebTokenError' || anyErr?.name === 'TokenExpiredError') {
    const isExpired = anyErr.name === 'TokenExpiredError';
    res.status(401).json({
      detail: isExpired ? 'Token has expired' : 'Token is invalid',
      code: isExpired ? 'token_expired' : 'token_not_valid',
      requestId,
    });
    return;
  }

  // 5. Multer file upload errors
  if (anyErr?.name === 'MulterError') {
    if (anyErr.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        detail: 'File too large.',
        code: 'FILE_TOO_LARGE',
        requestId,
      });
      return;
    }
    res.status(400).json({
      detail: String(anyErr.message || 'File upload error.'),
      code: 'UPLOAD_ERROR',
      requestId,
    });
    return;
  }

  // 6. Body-parser syntax and size errors
  if (anyErr && (anyErr.type === 'entity.too.large' || anyErr.status === 413)) {
    res.status(413).json({
      detail: 'Payload too large.',
      code: 'PAYLOAD_TOO_LARGE',
      requestId,
    });
    return;
  }

  if (
    anyErr &&
    (anyErr.type === 'entity.parse.failed' ||
      (err instanceof SyntaxError && anyErr.status === 400))
  ) {
    res.status(400).json({
      detail: 'Malformed JSON payload.',
      code: 'MALFORMED_JSON',
      requestId,
    });
    return;
  }

  // 7. Unknown / internal error
  const standardError = err instanceof Error ? err : new Error(String(err));
  logger.error({ requestId, err: standardError }, standardError.message);

  res.status(500).json({
    detail: isProd ? 'Internal server error.' : standardError.message,
    code: 'INTERNAL_SERVER_ERROR',
    requestId,
  });
}
