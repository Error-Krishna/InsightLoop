import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory fallback stores
const ipStore = new Map<string, RateLimitRecord>();
const ipEmailStore = new Map<string, RateLimitRecord>();

export function resetAuthRateLimits(): void {
  ipStore.clear();
  ipEmailStore.clear();
}

/**
 * Extracts normalized client IP (respecting trust proxy when active)
 */
export function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * General IP-level rate limiter for auth routes
 */
export function authIpRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const windowMs = env.AUTH_RATE_LIMIT_WINDOW_MS;
  const maxRequests = 100; // Tolerant IP cap for offices (100 req/15min)
  const clientIp = getClientIp(req);
  const now = Date.now();

  const record = ipStore.get(clientIp);
  if (!record || now > record.resetAt) {
    ipStore.set(clientIp, { count: 1, resetAt: now + windowMs });
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
    next();
    return;
  }

  if (record.count >= maxRequests) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    res.setHeader('Retry-After', retryAfterSec);
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', 0);
    const requestId = req.id ?? req.requestId ?? 'unknown';
    res.status(429).json({
      detail: 'Too many requests. Please try again later.',
      code: 'TOO_MANY_REQUESTS',
      requestId,
    });
    return;
  }

  record.count += 1;
  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
  next();
}

/**
 * Targeted brute-force protector for failed logins per IP+email
 */
export function loginBruteForceLimiter(req: Request, res: Response, next: NextFunction): void {
  const windowMs = env.AUTH_RATE_LIMIT_WINDOW_MS;
  const maxAttempts = env.AUTH_RATE_LIMIT_MAX_ATTEMPTS; // Default 10 failed attempts
  const clientIp = getClientIp(req);
  const reqBody = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : undefined;
  const rawEmail = typeof reqBody?.email === 'string' ? reqBody.email : '';
  const email = rawEmail.trim().toLowerCase();
  const now = Date.now();

  if (!email) {
    next();
    return;
  }

  const key = `${clientIp}::${email}`;
  const record = ipEmailStore.get(key);

  if (record && now <= record.resetAt && record.count >= maxAttempts) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    res.setHeader('Retry-After', retryAfterSec);
    res.setHeader('X-RateLimit-Limit', maxAttempts);
    res.setHeader('X-RateLimit-Remaining', 0);
    const requestId = req.id ?? req.requestId ?? 'unknown';
    res.status(429).json({
      detail: 'Too many requests. Please try again later.',
      code: 'TOO_MANY_REQUESTS',
      requestId,
    });
    return;
  }

  // Hook response to increment on 401 and reset on 200
  const originalJson = res.json.bind(res);
  res.json = (body: unknown): Response => {
    if (res.statusCode === 401) {
      const current = ipEmailStore.get(key);
      if (!current || now > current.resetAt) {
        ipEmailStore.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        current.count += 1;
      }
    } else if (res.statusCode === 200) {
      ipEmailStore.delete(key);
    }
    return originalJson(body);
  };

  next();
}
