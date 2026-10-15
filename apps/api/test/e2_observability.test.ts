import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectMongo, closeMongo } from '../src/db/mongo.js';
import { HealthRepository } from '../src/modules/health/health.repository.js';

describe('E2: Observability & Metrics Endpoints Suite', () => {
  beforeAll(async () => {
    await connectMongo();
  });

  afterAll(async () => {
    await closeMongo();
  });

  it('GET /health/detailed returns 200 with complete system diagnostics in healthy state', async () => {
    const res = await request(app).get('/health/detailed');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'healthy',
      ready: true,
    });

    expect(typeof res.body.uptime_seconds).toBe('number');
    expect(typeof res.body.event_loop_lag_ms).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');

    // Memory checks
    expect(res.body.memory).toHaveProperty('rss_bytes');
    expect(res.body.memory).toHaveProperty('heap_total_bytes');
    expect(res.body.memory).toHaveProperty('heap_used_bytes');

    // Mongo checks & pool
    expect(res.body.checks.mongodb).toMatchObject({
      status: 'up',
    });
    expect(typeof res.body.checks.mongodb.latency_ms).toBe('number');
    expect(res.body.checks.mongodb.pool).toHaveProperty('maxPoolSize');

    // Redis checks
    expect(res.body.checks.redis).toHaveProperty('status');
  });

  it('GET /api/v1/health/detailed matches the root endpoint contract', async () => {
    const res = await request(app).get('/api/v1/health/detailed');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.status).toBe('healthy');
  });

  it('GET /metrics returns 200 in standard Prometheus text format', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');

    const text = res.text;
    expect(text).toContain('# HELP process_uptime_seconds');
    expect(text).toContain('# HELP nodejs_eventloop_lag_seconds');
    expect(text).toContain('# HELP nodejs_memory_rss_bytes');
    expect(text).toContain('# HELP nodejs_memory_heap_used_bytes');
    expect(text).toContain('# HELP mongodb_up');
    expect(text).toContain('mongodb_up 1');
  });

  it('GET /health/detailed returns 503 degraded when MongoDB check fails', async () => {
    const checkMongoSpy = vi.spyOn(HealthRepository, 'checkMongo').mockResolvedValueOnce({
      status: 'down',
      latency_ms: -1,
      pool: { maxPoolSize: 100, minPoolSize: 0 },
    });

    const res = await request(app).get('/health/detailed');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'degraded',
      ready: false,
      checks: {
        mongodb: {
          status: 'down',
          latency_ms: -1,
        },
      },
    });

    checkMongoSpy.mockRestore();
  });
});
