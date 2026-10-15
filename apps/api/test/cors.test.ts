import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './testHelper.js';

describe('CORS, Security Headers & RequestId Propagation Suite', () => {
  it('reflects Access-Control-Allow-Origin for whitelisted origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not reflect Access-Control-Allow-Origin for unauthorized origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://malicious-attacker-site.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles CORS OPTIONS preflight request correctly', async () => {
    const res = await request(app)
      .options('/api/v1/bills/')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });

  it('sets standard Helmet security headers on all responses', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-download-options']).toBe('noopen');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('generates a new UUID X-Request-ID header when none is provided in request', async () => {
    const res = await request(app).get('/health');

    const requestId = res.headers['x-request-id'] as string;
    expect(requestId).toBeDefined();
    // UUID v4 format verification: 8-4-4-4-12 hex characters
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)).toBe(true);
  });

  it('propagates client-supplied X-Request-ID header through the response', async () => {
    const clientTraceId = 'trace-client-distributed-12345';
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', clientTraceId);

    expect(res.headers['x-request-id']).toBe(clientTraceId);
  });
});
