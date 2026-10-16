import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { logger } from '../src/utils/logger.js';

describe('Legacy Deprecated Routes & Shadow Route Diagnostic Logging', () => {
  it('logs warn with route, method, and user-agent on legacy route hit and returns 404 with shadow route header', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');

    const res = await request(app)
      .get('/dashboard')
      .set('User-Agent', 'TestBrowser/1.0');

    expect(res.status).toBe(404);
    expect(res.headers['x-insightloop-shadow-route']).toBe('legacy-django-view');
    expect(res.body).toEqual({
      status: 404,
      error: 'Legacy server-rendered Django endpoint is deprecated. Use the InsightLoop React SPA.',
      classification: 'NEEDS-TRAFFIC-EVIDENCE',
      path: '/dashboard',
    });

    expect(warnSpy).toHaveBeenCalled();
    const warnCall = warnSpy.mock.calls.find((call) =>
      typeof call[1] === 'string' && call[1].includes('NEEDS-TRAFFIC-EVIDENCE')
    );
    expect(warnCall).toBeDefined();
    const logMeta = warnCall?.[0] as Record<string, unknown>;
    expect(logMeta.path).toBe('/dashboard');
    expect(logMeta.method).toBe('GET');
    expect(logMeta.userAgent).toBe('TestBrowser/1.0');

    warnSpy.mockRestore();
  });

  it('handles post requests on legacy endpoints with shadow response and logging', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');

    const res = await request(app)
      .post('/insights')
      .set('User-Agent', 'Curl/8.1.0')
      .send({ legacy: true });

    expect(res.status).toBe(404);
    expect(res.headers['x-insightloop-shadow-route']).toBe('legacy-django-view');
    expect(res.body.classification).toBe('NEEDS-TRAFFIC-EVIDENCE');

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
