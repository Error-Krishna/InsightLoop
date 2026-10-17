import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearDatabase, getDb, app } from './testHelper.js';
import { env } from '../src/config/env.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

describe('B10: Signup Race Conditions & Refresh Token Edge Cases Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  // (a) Concurrent duplicate signup: exactly one 201, one 400, no orphan company
  it('handles 2 concurrent signups with identical email: exactly one 201, one 400, and zero orphan companies', async () => {
    const signupData = {
      name: 'Racer Alex',
      email: 'racer.alex@concurrent-race.com',
      password: 'password123',
      company_name: 'Alex Enterprises',
    };

    // Fire 2 simultaneous signup requests
    const [res1, res2] = await Promise.all([
      request(app).post('/api/v1/auth/signup/').send(signupData),
      request(app).post('/api/v1/auth/signup/').send(signupData),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 400]);

    const failRes = res1.status === 400 ? res1 : res2;
    const successRes = res1.status === 201 ? res1 : res2;

    // Successful response must contain user and tokens
    expect(successRes.body.user.email).toBe(signupData.email);
    expect(successRes.body.tokens.access).toBeDefined();

    // Failed response must be a clean 400 with "Email already registered." and zero 500 error leak
    expect(failRes.body.detail).toBe('Email already registered.');
    expect(failRes.body.code).not.toBe('INTERNAL_SERVER_ERROR');

    // DB Verification: exactly 1 User document, and exactly 1 Company document in DB (no orphan company)
    const db = getDb();
    const userCount = await db.collection('user').countDocuments({ email: signupData.email });
    expect(userCount).toBe(1);

    const companyCount = await db.collection('company').countDocuments({ email: signupData.email });
    expect(companyCount).toBe(1);
  });

  // (b) Refresh token edge cases
  describe('(b) Refresh token edge cases (matching Django SimpleJWT defaults)', () => {
    it('returns 401 "Token is invalid or expired" when refresh token is expired', async () => {
      const expiredRefreshToken = jwt.sign(
        {
          token_type: 'refresh',
          user_id: '666666666666666666666666',
          email: 'test@example.com',
          company_id: 'test-comp',
          name: 'Test',
          jti: 'exp123',
        },
        env.JWT_SECRET,
        { expiresIn: -10 }
      );

      const res = await request(app).post('/api/v1/auth/refresh/').send({ refresh: expiredRefreshToken });

      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/Token is invalid or expired/i);
    });

    it('returns 401 "Token is invalid or expired" when token string is malformed or invalid', async () => {
      const res = await request(app).post('/api/v1/auth/refresh/').send({ refresh: 'invalid.jwt.token' });

      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/Token is invalid or expired/i);
    });

    it('returns 400 when refresh token is missing from request body', async () => {
      const res = await request(app).post('/api/v1/auth/refresh/').send({});

      expect(res.status).toBe(400);
      expect(res.body.detail).toMatch(/Refresh token is required/i);
    });

    it('allows using a non-rotating refresh token multiple times, matching Django simplejwt defaults', async () => {
      // 1. Sign up user to get valid tokens
      const signupRes = await request(app).post('/api/v1/auth/signup/').send({
        name: 'Token Reuser',
        email: 'reuser@example.com',
        password: 'password123',
        company_name: 'Reuse Corp',
      });
      expect(signupRes.status).toBe(201);
      const refreshToken = signupRes.body.tokens.refresh;

      // 2. Use refresh token first time
      const refreshRes1 = await request(app).post('/api/v1/auth/refresh/').send({ refresh: refreshToken });
      expect(refreshRes1.status).toBe(200);
      expect(refreshRes1.body.access).toBeDefined();

      // 3. Use the exact same refresh token a second time (non-rotating SimpleJWT default)
      const refreshRes2 = await request(app).post('/api/v1/auth/refresh/').send({ refresh: refreshToken });
      expect(refreshRes2.status).toBe(200);
      expect(refreshRes2.body.access).toBeDefined();

      // Both minted access tokens are valid
      const access1 = refreshRes1.body.access;
      const access2 = refreshRes2.body.access;
      expect(typeof access1).toBe('string');
      expect(typeof access2).toBe('string');
    });

    it('rejects access token passed to refresh endpoint with 401', async () => {
      const signupRes = await request(app).post('/api/v1/auth/signup/').send({
        name: 'Access User',
        email: 'access@example.com',
        password: 'password123',
        company_name: 'Access Corp',
      });
      const accessToken = signupRes.body.tokens.access;

      const res = await request(app).post('/api/v1/auth/refresh/').send({ refresh: accessToken });
      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/Token is invalid or expired/i);
    });
  });
});
