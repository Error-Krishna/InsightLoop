import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { setupTestDb, getDb } from './testHelper.js';
import { resetAuthRateLimits } from '../src/middleware/rateLimiter.js';

describe('A3: Auth Rate Limiting & Brute-Force Protection', () => {
  beforeAll(async () => {
    await setupTestDb();
    const db = getDb();
    await db.collection('user').deleteMany({ email: /ratelimit/ });
  });

  beforeEach(() => {
    resetAuthRateLimits();
  });

  it('allows failed logins below the threshold (non-trigger)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '203.0.113.10')
        .send({ email: 'ratelimit-target@example.com', password: 'WrongPassword!' });
      expect(res.status).toBe(401);
    }
  });

  it('triggers HTTP 429 when failed login attempts exceed the per-IP+email threshold', async () => {
    // Perform 10 failed login attempts
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '203.0.113.20')
        .send({ email: 'victim@example.com', password: 'WrongPassword!' });
      expect(res.status).toBe(401);
    }

    // 11th attempt should trigger 429
    const blockedRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '203.0.113.20')
      .send({ email: 'victim@example.com', password: 'WrongPassword!' });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.code).toBe('TOO_MANY_REQUESTS');
    expect(blockedRes.body.detail).toBe('Too many requests. Please try again later.');
    expect(blockedRes.headers).toHaveProperty('retry-after');
  });

  it('protects office colleagues behind one IP by keying failed attempts per IP+email', async () => {
    // 10 failed attempts for user A from office IP
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '198.51.100.50')
        .send({ email: 'user-a@example.com', password: 'WrongPassword!' });
    }

    // User A is blocked
    const userABlocked = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.50')
      .send({ email: 'user-a@example.com', password: 'WrongPassword!' });
    expect(userABlocked.status).toBe(429);

    // User B from the same office IP is NOT blocked
    const userBRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.50')
      .send({ email: 'user-b@example.com', password: 'WrongPassword!' });
    expect(userBRes.status).toBe(401); // 401 invalid creds, NOT 429
  });

  it('respects trust proxy and extracts real client IP from X-Forwarded-For', async () => {
    // Client 1 with IP 192.0.2.1
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '192.0.2.1')
        .send({ email: 'shared@example.com', password: 'WrongPassword!' });
    }
    const res1 = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '192.0.2.1')
      .send({ email: 'shared@example.com', password: 'WrongPassword!' });
    expect(res1.status).toBe(429);

    // Client 2 with different IP 192.0.2.2 for the same email is NOT blocked
    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '192.0.2.2')
      .send({ email: 'shared@example.com', password: 'WrongPassword!' });
    expect(res2.status).toBe(401);
  });
});
