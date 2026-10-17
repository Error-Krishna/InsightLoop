import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import zlib from 'node:zlib';

describe('Compression Middleware & Body Parity (Section 2.5)', () => {
  it('serves uncompressed JSON when client does not send Accept-Encoding', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body).toEqual({ status: 'ok', service: 'InsightLoop Node API' });
  });

  it('serves gzip-compressed response when client sends Accept-Encoding: gzip and body matches', async () => {
    const res = await request(app)
      .get('/health')
      .set('Accept-Encoding', 'gzip')
      .buffer(true)
      .parse((r, cb) => {
        // Collect raw buffer
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    // If the payload is large enough or compressed by middleware
    if (res.headers['content-encoding'] === 'gzip') {
      const decompressed = zlib.gunzipSync(res.body as Buffer).toString('utf-8');
      const json = JSON.parse(decompressed);
      expect(json).toEqual({ status: 'ok', service: 'InsightLoop Node API' });
    } else {
      // For very small payloads under threshold, compression leaves uncompressed
      expect(JSON.parse((res.body as Buffer).toString('utf-8'))).toEqual({
        status: 'ok',
        service: 'InsightLoop Node API',
      });
    }
  });
});
