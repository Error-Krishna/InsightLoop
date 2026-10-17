import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { requestMetricsStorage, type RequestMetricsContext } from '../db/mongo.js';

export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();
  const context: RequestMetricsContext = { mongoDurationMs: 0 };

  res.on('finish', () => {
    const totalDurationMs = Math.round((performance.now() - start) * 100) / 100;
    const mongoDurationMs = Math.round(context.mongoDurationMs * 100) / 100;
    const routePath = typeof (req.route as { path?: unknown } | undefined)?.path === 'string'
      ? (req.route as { path: string }).path
      : req.path;
    const route = req.baseUrl
      ? `${req.baseUrl}${routePath}`
      : routePath;

    logger.info(
      {
        method: req.method,
        route,
        status: res.statusCode,
        totalDurationMs,
        mongoDurationMs,
      },
      'Request completed'
    );
  });

  requestMetricsStorage.run(context, () => {
    next();
  });
}
