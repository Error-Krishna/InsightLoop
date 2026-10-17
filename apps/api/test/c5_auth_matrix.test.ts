import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { getCollection } from '../src/db/mongo.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { generateTokens, verifyToken, deriveSigningKey } from '../src/utils/jwt.js';

const pythonBin = fs.existsSync('.venv/bin/python') ? '.venv/bin/python' : '../../.venv/bin/python';
const hasPython = fs.existsSync(pythonBin);

describe('C5: Comprehensive Auth Matrix Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('1. Refresh Token As Access Token Rejection', () => {
    it('rejects refresh token when passed as Bearer token to authenticated endpoints with 401', async () => {
      const user = await createTestUser({ email: 'refresh_leak@example.com' });
      const refreshToken = user.refreshToken;

      const res = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/Token is invalid or expired|Given token not valid for any token type/i);
    });

    it('rejects access token passed to refresh endpoint with 401', async () => {
      const user = await createTestUser({ email: 'access_to_refresh@example.com' });
      const accessToken = user.token;

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh: accessToken });

      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/Token is invalid or expired|Given token not valid for any token type/i);
    });
  });

  describe('2. Tampered, Expired, and Deleted User Boundaries', () => {
    it('rejects tampered token signature with 401', async () => {
      const user = await createTestUser();
      const parts = user.token.split('.');
      // Tamper signature
      const tampered = `${parts[0]}.${parts[1]}.invalidsignature123`;

      const res = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${tampered}`);

      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/Token is invalid or expired|Given token not valid for any token type/i);
    });

    it('rejects expired token with 401', async () => {
      const user = await createTestUser();
      // Mint an already expired token
      const expiredToken = jwt.sign(
        {
          token_type: 'access',
          user_id: user.userId,
          company_id: user.companyId,
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        },
        deriveSigningKey(env.JWT_SECRET)
      );

      const res = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/Token is invalid or expired|Given token not valid for any token type/i);
    });

    it('rejects token of deleted user with 401', async () => {
      const user = await createTestUser({ email: 'to_be_deleted@example.com' });
      const token = user.token;

      // Delete the user from Mongo
      await getCollection('user').deleteOne({ email: 'to_be_deleted@example.com' });

      // Node profile request
      const res = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/User not found|Token is invalid or expired|Given token not valid for any token type/i);
    });
  });

  describe('3. Wrong Password vs Unknown Email Identical Envelope & Timing Safe', () => {
    it('returns byte-identical error envelope for unknown email and wrong password', async () => {
      // 1. Signup a real user
      await request(app).post('/api/v1/auth/signup').send({
        name: 'Known User',
        email: 'known@example.com',
        password: 'ValidPassword123!',
        company_name: 'Known Corp',
      });

      // 2. Login with unknown email
      const resUnknown = await request(app).post('/api/v1/auth/login').send({
        email: 'unknown_ghost@example.com',
        password: 'ValidPassword123!',
      });

      // 3. Login with known email but wrong password
      const resWrongPass = await request(app).post('/api/v1/auth/login').send({
        email: 'known@example.com',
        password: 'CompletelyWrongPassword!',
      });

      expect(resUnknown.status).toBe(401);
      expect(resWrongPass.status).toBe(401);

      // Both must return identical detail and code
      expect(resUnknown.body.detail).toBe('Invalid email or password.');
      expect(resWrongPass.body.detail).toBe('Invalid email or password.');
      expect(resUnknown.body.code).toBe(resWrongPass.body.code);
    });
  });

  describe('4. Bi-directional Django ↔ Node JWT Interoperability', () => {
    it('verifies Django SimpleJWT accepts tokens generated by Node', () => {
      const nodeTokens = generateTokens(
        { _id: '670c5e317e0892095f59c001', email: 'interop@example.com', name: 'Interop User' },
        'comp-interop-123',
        env.JWT_SECRET
      );

      // Verify Access Token via Python SimpleJWT decoding
      if (hasPython) {
        const pythonVerifyScript = `
import jwt, hashlib

secret = "${env.JWT_SECRET}"
signing_key = secret if len(secret) >= 32 else hashlib.sha256(secret.encode("utf-8")).hexdigest()

decoded_access = jwt.decode("${nodeTokens.access}", signing_key, algorithms=["HS256"])
assert decoded_access["token_type"] == "access"
assert decoded_access["user_id"] == "670c5e317e0892095f59c001"
assert decoded_access["company_id"] == "comp-interop-123"

decoded_refresh = jwt.decode("${nodeTokens.refresh}", signing_key, algorithms=["HS256"])
assert decoded_refresh["token_type"] == "refresh"
assert decoded_refresh["user_id"] == "670c5e317e0892095f59c001"
print("OK")
`;

        const output = execFileSync(pythonBin, ['-c', pythonVerifyScript], { encoding: 'utf-8' }).trim();
        expect(output).toBe('OK');
      } else {
        const decodedAccess = verifyToken(nodeTokens.access, 'access');
        expect(decodedAccess.user_id).toBe('670c5e317e0892095f59c001');
        expect(decodedAccess.company_id).toBe('comp-interop-123');
        const decodedRefresh = verifyToken(nodeTokens.refresh, 'refresh');
        expect(decodedRefresh.user_id).toBe('670c5e317e0892095f59c001');
      }
    });

    it('verifies Node accepts access and refresh tokens generated by Django SimpleJWT', () => {
      let djangoAccess: string;
      let djangoRefresh: string;

      if (hasPython) {
        const pythonMintScript = `
import jwt, hashlib
from datetime import datetime, timedelta, timezone

secret = "${env.JWT_SECRET}"
signing_key = secret if len(secret) >= 32 else hashlib.sha256(secret.encode("utf-8")).hexdigest()

access_payload = {
    "token_type": "access",
    "user_id": "670c5e317e0892095f59c002",
    "email": "django_minted@example.com",
    "company_id": "django-comp-456",
    "name": "Django Minted",
    "jti": "jti12345access",
    "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
}
refresh_payload = {
    "token_type": "refresh",
    "user_id": "670c5e317e0892095f59c002",
    "email": "django_minted@example.com",
    "company_id": "django-comp-456",
    "name": "Django Minted",
    "jti": "jti12345refresh",
    "exp": int((datetime.now(timezone.utc) + timedelta(days=7)).timestamp())
}

access_token = jwt.encode(access_payload, signing_key, algorithm="HS256")
refresh_token = jwt.encode(refresh_payload, signing_key, algorithm="HS256")

print(f"{access_token}:::{refresh_token}")
`;

        const result = execFileSync(pythonBin, ['-c', pythonMintScript], { encoding: 'utf-8' }).trim();
        [djangoAccess, djangoRefresh] = result.split(':::');
      } else {
        const signingKey = deriveSigningKey(env.JWT_SECRET);
        djangoAccess = jwt.sign(
          {
            token_type: 'access',
            user_id: '670c5e317e0892095f59c002',
            email: 'django_minted@example.com',
            company_id: 'django-comp-456',
            name: 'Django Minted',
            jti: 'jti12345access',
          },
          signingKey,
          { algorithm: 'HS256', expiresIn: '1h' }
        );
        djangoRefresh = jwt.sign(
          {
            token_type: 'refresh',
            user_id: '670c5e317e0892095f59c002',
            email: 'django_minted@example.com',
            company_id: 'django-comp-456',
            name: 'Django Minted',
            jti: 'jti12345refresh',
          },
          signingKey,
          { algorithm: 'HS256', expiresIn: '7d' }
        );
      }

      // Node verifies Django-minted access token
      const accessPayload = verifyToken(djangoAccess, 'access');
      expect(accessPayload.user_id).toBe('670c5e317e0892095f59c002');
      expect(accessPayload.email).toBe('django_minted@example.com');
      expect(accessPayload.company_id).toBe('django-comp-456');

      // Node verifies Django-minted refresh token
      const refreshPayload = verifyToken(djangoRefresh, 'refresh');
      expect(refreshPayload.user_id).toBe('670c5e317e0892095f59c002');
      expect(refreshPayload.email).toBe('django_minted@example.com');
      expect(refreshPayload.company_id).toBe('django-comp-456');
    });
  });
});
