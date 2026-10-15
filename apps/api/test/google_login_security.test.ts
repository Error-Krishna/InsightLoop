import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { setupTestDb, getDb } from './testHelper.js';
import { env } from '../src/config/env.js';

describe('A1: Google Login Audience & Security', () => {
  let mockServer: http.Server;
  let mockUrl: string;
  let serverMode = 'valid';

  beforeAll(async () => {
    await setupTestDb();
    const db = getDb();
    await db.collection('user').createIndex({ email: 1 }, { unique: true });

    // Configure mock tokeninfo server
    mockServer = http.createServer((req, res) => {
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      const token = url.searchParams.get('id_token');

      if (serverMode === 'timeout') {
        // Do not respond; wait for client timeout
        return;
      }

      if (serverMode === 'non-200' || token === 'bad-token') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_token' }));
        return;
      }

      if (serverMode === 'wrong-aud') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          aud: 'wrong-audience-client-id.apps.googleusercontent.com',
          email: 'google-aud-test@example.com',
          email_verified: 'true',
          name: 'Audience Tester',
        }));
        return;
      }

      if (serverMode === 'missing-aud') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          email: 'google-aud-test@example.com',
          email_verified: 'true',
          name: 'Audience Tester',
        }));
        return;
      }

      if (serverMode === 'unverified') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          aud: env.GOOGLE_CLIENT_ID || 'mock-google-client-id',
          email: 'unverified-google@example.com',
          email_verified: false,
          name: 'Unverified User',
        }));
        return;
      }

      if (serverMode === 'no-email') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          aud: env.GOOGLE_CLIENT_ID || 'mock-google-client-id',
          email_verified: 'true',
          name: 'No Email User',
        }));
        return;
      }

      // Valid response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        aud: env.GOOGLE_CLIENT_ID || 'mock-google-client-id',
        email: 'valid-google-user@example.com',
        email_verified: 'true',
        name: 'Valid Google User',
      }));
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as AddressInfo;
        mockUrl = `http://127.0.0.1:${addr.port}/tokeninfo`;
        process.env.GOOGLE_TOKENINFO_URL = mockUrl;
        resolve();
      });
    });
  });

  afterAll(async () => {
    delete process.env.GOOGLE_TOKENINFO_URL;
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('rejects with 401 when aud does not match GOOGLE_CLIENT_ID', async () => {
    serverMode = 'wrong-aud';
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'token-with-wrong-aud' });

    expect(res.status).toBe(401);
    expect(res.body.detail).toBe('Google credential was not issued for this application.');
  });

  it('rejects with 401 when aud is missing in tokeninfo payload', async () => {
    serverMode = 'missing-aud';
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'token-with-missing-aud' });

    expect(res.status).toBe(401);
    expect(res.body.detail).toBe('Google credential was not issued for this application.');
  });

  it('rejects with 401 when email_verified is false or not true', async () => {
    serverMode = 'unverified';
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'token-unverified' });

    expect(res.status).toBe(401);
    expect(res.body.detail).toBe('Google email is not verified.');
  });

  it('rejects with 400 when email is missing in tokeninfo response', async () => {
    serverMode = 'no-email';
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'token-no-email' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Google account has no email.');
  });

  it('rejects with 401 when tokeninfo returns non-200', async () => {
    serverMode = 'non-200';
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'bad-token' });

    expect(res.status).toBe(401);
    expect(res.body.detail).toBe('Invalid or expired Google credential.');
  });

  it('returns 502 when tokeninfo request encounters network error', async () => {
    // Point to a non-existent port
    const originalUrl = process.env.GOOGLE_TOKENINFO_URL;
    process.env.GOOGLE_TOKENINFO_URL = 'http://127.0.0.1:59999/down';

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'any-token' });

    process.env.GOOGLE_TOKENINFO_URL = originalUrl;
    expect(res.status).toBe(502);
    expect(res.body.detail).toBe('Could not verify Google credential.');
  });

  it('creates Google user with Django-compatible PBKDF2 hash, company, and fields', async () => {
    serverMode = 'valid';
    const db = getDb();
    await db.collection('user').deleteMany({ email: 'valid-google-user@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'good-token' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('valid-google-user@example.com');
    expect(res.body.tokens).toHaveProperty('access');
    expect(res.body.tokens).toHaveProperty('refresh');

    // Check user document directly in Mongo
    const userDoc = await db.collection('user').findOne({ email: 'valid-google-user@example.com' });
    expect(userDoc).toBeDefined();
    expect(userDoc!.password).toMatch(/^pbkdf2_sha256\$600000\$[A-Za-z0-9.+/]+\$[A-Za-z0-9+/=]+$/);
    expect(userDoc!.company).toBeDefined();
    expect(userDoc!.username).toBe('valid-google-user');
    expect(userDoc!.subscription).toBe('Pro Plan (₹499/mo)');
    expect(userDoc!.notifications).toBeDefined();
    expect(userDoc!.last_login).toBeInstanceOf(Date);
  });

  it('handles double-submit concurrently without creating duplicate users or companies', async () => {
    serverMode = 'valid';
    const db = getDb();
    await db.collection('user').deleteMany({ email: 'valid-google-user@example.com' });
    await db.collection('company').deleteMany({ name: "Valid Google User's Company" });

    // Send two concurrent requests
    const [res1, res2] = await Promise.all([
      request(app).post('/api/v1/auth/google').send({ credential: 'good-token' }),
      request(app).post('/api/v1/auth/google').send({ credential: 'good-token' }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const userCount = await db.collection('user').countDocuments({ email: 'valid-google-user@example.com' });
    expect(userCount).toBe(1);

    const companyCount = await db.collection('company').countDocuments({ name: "Valid Google User's Company" });
    expect(companyCount).toBe(1);
  });
});
