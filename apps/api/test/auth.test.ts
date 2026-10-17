import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';

describe('Auth Module Integration Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('signs up a new user and company successfully', async () => {
    const signupData = {
      name: 'Priya Sharma',
      email: 'priya@example.com',
      password: 'StrongPassword123!',
      company_name: 'Sharma Textiles Ltd',
      business_type: 'Manufacturing',
    };

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send(signupData);

    expect(res.status).toBe(201);
    expect(res.body.tokens.access).toBeDefined();
    expect(res.body.tokens.refresh).toBeDefined();
    expect(res.body.user.email).toBe('priya@example.com');
    expect(res.body.user.name).toBe('Priya Sharma');

    // Duplicate signup with same email must fail
    const dupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send(signupData);

    expect(dupRes.status).toBe(400);
    expect(dupRes.body.detail).toContain('already registered');
  });

  it('authenticates a registered user with correct credentials and rejects invalid credentials', async () => {
    const user = await createTestUser({ email: 'login_test@example.com', password: 'SecretPassword987!' });

    // Valid login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'login_test@example.com',
        password: 'SecretPassword987!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.tokens.access).toBeDefined();
    expect(loginRes.body.tokens.refresh).toBeDefined();
    expect(loginRes.body.user.email).toBe('login_test@example.com');

    // Invalid password
    const badPassRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'login_test@example.com',
        password: 'WrongPassword!',
      });

    expect(badPassRes.status).toBe(401);
    expect(badPassRes.body.detail).toContain('Invalid');

    // Non-existent email
    const noUserRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'AnyPassword!',
      });

    expect(noUserRes.status).toBe(401);
  });

  it('refreshes an access token using a valid refresh token', async () => {
    const user = await createTestUser();

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh: user.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.access).toBeDefined();

    // Invalid refresh token
    const badRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh: 'invalid.refresh.token' });

    expect(badRefreshRes.status).toBe(401);
  });
});
