import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Root Endpoint & Metrics Authentication Protection', () => {
  const originalFrontendOrigin = env.FRONTEND_ORIGIN;
  const originalMetricsToken = env.METRICS_TOKEN;
  const originalEnvFrontend = process.env.FRONTEND_ORIGIN;
  const originalEnvMetrics = process.env.METRICS_TOKEN;

  beforeEach(() => {
    env.FRONTEND_ORIGIN = '';
    delete process.env.FRONTEND_ORIGIN;
    env.METRICS_TOKEN = 'secret-test-metrics-token-12345';
    process.env.METRICS_TOKEN = 'secret-test-metrics-token-12345';
  });

  afterEach(() => {
    env.FRONTEND_ORIGIN = originalFrontendOrigin;
    env.METRICS_TOKEN = originalMetricsToken;
    if (originalEnvFrontend !== undefined) process.env.FRONTEND_ORIGIN = originalEnvFrontend;
    else delete process.env.FRONTEND_ORIGIN;
    if (originalEnvMetrics !== undefined) process.env.METRICS_TOKEN = originalEnvMetrics;
    else delete process.env.METRICS_TOKEN;
  });

  describe('Root URL (GET /)', () => {
    it('returns 200 JSON with service status when FRONTEND_ORIGIN is unset (matching Django root_redirect)', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        service: 'InsightLoop API',
      });
    });

    it('redirects with 302 to FRONTEND_ORIGIN when FRONTEND_ORIGIN is set (matching Django root_redirect)', async () => {
      env.FRONTEND_ORIGIN = 'https://insightloop.vercel.app';
      process.env.FRONTEND_ORIGIN = 'https://insightloop.vercel.app';

      const res = await request(app).get('/');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://insightloop.vercel.app');
    });

    it('never crashes or returns 500 on root path', async () => {
      env.FRONTEND_ORIGIN = '';
      const res = await request(app).get('/');
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('Public Health Endpoints (Zero Auth Required)', () => {
    it('allows public access to GET /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('allows public access to GET /api/v1/health/live', async () => {
      const res = await request(app).get('/api/v1/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('allows public access to GET /api/v1/health/ready (returns 200 or 503 readiness status without auth error)', async () => {
      const res = await request(app).get('/api/v1/health/ready');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
    });
  });

  describe('Protected Metrics & Detailed Health Diagnostics', () => {
    const protectedPaths = [
      '/health/detailed',
      '/metrics',
      '/api/v1/metrics',
      '/api/v1/health/detailed',
      '/api/v1/health/metrics',
    ];

    for (const path of protectedPaths) {
      it(`blocks unauthenticated access to ${path} with 401 Unauthorized`, async () => {
        const res = await request(app).get(path);
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('Unauthorized');
      });

      it(`blocks invalid token access to ${path} with 401 Unauthorized`, async () => {
        const res = await request(app)
          .get(path)
          .set('x-metrics-token', 'wrong-token');
        expect(res.status).toBe(401);
      });

      it(`allows access to ${path} with valid x-metrics-token header`, async () => {
        const res = await request(app)
          .get(path)
          .set('x-metrics-token', 'secret-test-metrics-token-12345');
        // Detailed health returns 200 when connected or 503 when DB not connected in test runner; metrics returns 200
        expect([200, 503]).toContain(res.status);
        expect(res.status).not.toBe(401);
      });

      it(`allows access to ${path} with valid Bearer token header`, async () => {
        const res = await request(app)
          .get(path)
          .set('Authorization', 'Bearer secret-test-metrics-token-12345');
        expect([200, 503]).toContain(res.status);
        expect(res.status).not.toBe(401);
      });
    }
  });
});
