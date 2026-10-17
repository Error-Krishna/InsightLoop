import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestUser, clearDatabase } from './testHelper.js';
import { env } from '../src/config/env.js';

describe('Auth Deep Suite: Google OAuth & Token Refresh Boundaries', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles Google login for new user and generates valid JWT tokens', async () => {
    // Mock fetch for Google tokeninfo
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aud: env.GOOGLE_CLIENT_ID || 'mock-google-client-id',
        email: 'googleuser@example.com',
        email_verified: 'true',
        name: 'Google User',
      }),
    } as unknown as Response);

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({
        credential: 'valid-mock-google-credential',
      });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('googleuser@example.com');
    expect(res.body.tokens).toHaveProperty('access');
    expect(res.body.tokens).toHaveProperty('refresh');

    // Logging in again with same Google email should succeed and link to existing user
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aud: env.GOOGLE_CLIENT_ID || 'mock-google-client-id',
        email: 'googleuser@example.com',
        email_verified: true,
        name: 'Google User',
      }),
    } as unknown as Response);

    const res2 = await request(app)
      .post('/api/v1/auth/google')
      .send({
        id_token: 'valid-mock-google-credential-2',
      });

    expect(res2.status).toBe(200);
    expect(res2.body.user.email).toBe('googleuser@example.com');
  });

  it('rejects Google login if Google token is rejected or unverified', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
    } as unknown as Response);

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'invalid-token' });

    expect(res.status).toBe(401);

    // Unverified email
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        email: 'unverified@example.com',
        email_verified: 'false',
      }),
    } as unknown as Response);

    const res2 = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'unverified-token' });

    expect(res2.status).toBe(401);
  });

  it('handles duplicate registration rejection', async () => {
    const user = await createTestUser('dup@example.com', 'Pass123!@#');

    const dupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Duplicate',
        email: user.email,
        company_name: 'Dup Corp',
        password: 'AnotherPassword123!',
      });

    expect(dupRes.status).toBe(400);
  });
});
