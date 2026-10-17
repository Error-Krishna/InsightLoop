import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Public Non-API Routes & Undefined Route Handling', () => {
  it('serves GET / matching Django root_redirect (200 JSON when FRONTEND_ORIGIN unset)', async () => {
    const orig = env.FRONTEND_ORIGIN;
    env.FRONTEND_ORIGIN = '';
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'InsightLoop API' });
    env.FRONTEND_ORIGIN = orig;
  });

  it('serves GET / with 302 redirect when FRONTEND_ORIGIN is set', async () => {
    const orig = env.FRONTEND_ORIGIN;
    env.FRONTEND_ORIGIN = 'https://app.insightloop.dev';
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://app.insightloop.dev');
    env.FRONTEND_ORIGIN = orig;
  });

  it('returns clean 404 for unrouted paths without inventing fake shadow routes', async () => {
    const res = await request(app).get('/nonexistent-page-path-12345');
    expect(res.status).toBe(404);
    expect(res.body.detail).toBe('Not found.');
  });
});
