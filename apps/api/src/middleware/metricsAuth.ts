import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * Shared-secret authorization middleware for internal diagnostics and Prometheus metrics.
 * Protects /health/detailed, /metrics, and /api/v1/metrics from unauthorized public disclosure.
 * Accepts token via `x-metrics-token` header or `Authorization: Bearer <METRICS_TOKEN>`.
 */
export function requireMetricsAuth(req: Request, res: Response, next: NextFunction): void {
  const headerToken = req.headers['x-metrics-token'] as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const providedToken = headerToken || bearerToken;

  const expectedToken = env.METRICS_TOKEN || process.env.METRICS_TOKEN;

  if (!expectedToken || !providedToken || providedToken !== expectedToken) {
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid metrics authorization token.',
    });
    return;
  }

  next();
}
