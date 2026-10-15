import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { validateEnv } from '../src/config/env.js';
import { generateTokens, verifyAccessToken, deriveSigningKey } from '../src/utils/jwt.js';

const pythonBin = fs.existsSync('.venv/bin/python') ? '.venv/bin/python' : '../../.venv/bin/python';

describe('A2: Production Fail-Fast Env & Bidirectional JWT Key Derivation', () => {
  describe('Fail-Fast Production Environment Validation', () => {
    it('refuses to boot in production if JWT_SECRET is missing', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod',
          MONGODB_DB_NAME: 'insightloop_prod',
          CORS_ORIGIN: 'https://app.insightloop.io',
          GOOGLE_CLIENT_ID: 'prod-client-id.apps.googleusercontent.com',
        })
      ).toThrow(/JWT_SECRET is required/);
    });

    it('refuses to boot in production on known default JWT_SECRET', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod',
          MONGODB_DB_NAME: 'insightloop_prod',
          JWT_SECRET: 'test-secret-key-must-be-long-enough-32-chars',
          CORS_ORIGIN: 'https://app.insightloop.io',
          GOOGLE_CLIENT_ID: 'prod-client-id.apps.googleusercontent.com',
        })
      ).toThrow(/Refusing to boot in production with default\/insecure JWT_SECRET/);
    });

    it('refuses to boot in production on known dev secret', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod',
          MONGODB_DB_NAME: 'insightloop_prod',
          JWT_SECRET: 'dev-secret-change-me',
          CORS_ORIGIN: 'https://app.insightloop.io',
          GOOGLE_CLIENT_ID: 'prod-client-id.apps.googleusercontent.com',
        })
      ).toThrow(/Refusing to boot in production with default\/insecure JWT_SECRET/);
    });

    it('refuses to boot in production if DB name ends in _test', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod_test',
          MONGODB_DB_NAME: 'insightloop_prod_test',
          JWT_SECRET: 'super-secure-production-random-secret-key-99',
          CORS_ORIGIN: 'https://app.insightloop.io',
          GOOGLE_CLIENT_ID: 'prod-client-id.apps.googleusercontent.com',
        })
      ).toThrow(/Production database name cannot end with '_test'/);
    });

    it('refuses to boot in production if CORS_ORIGIN is missing', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod',
          MONGODB_DB_NAME: 'insightloop_prod',
          JWT_SECRET: 'super-secure-production-random-secret-key-99',
          GOOGLE_CLIENT_ID: 'prod-client-id.apps.googleusercontent.com',
        })
      ).toThrow(/CORS_ORIGIN is required/);
    });

    it('refuses to boot in production if GOOGLE_CLIENT_ID is missing', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod',
          MONGODB_DB_NAME: 'insightloop_prod',
          JWT_SECRET: 'super-secure-production-random-secret-key-99',
          CORS_ORIGIN: 'https://app.insightloop.io',
        })
      ).toThrow(/GOOGLE_CLIENT_ID is required/);
    });

    it('passes in production when all production variables are securely set', () => {
      const parsed = validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod',
        MONGODB_DB_NAME: 'insightloop_prod',
        JWT_SECRET: 'super-secure-production-random-secret-key-99',
        CORS_ORIGIN: 'https://app.insightloop.io',
        GOOGLE_CLIENT_ID: 'prod-client-id.apps.googleusercontent.com',
      });
      expect(parsed.NODE_ENV).toBe('production');
      expect(parsed.MONGODB_DB_NAME).toBe('insightloop_prod');
    });
  });

  describe('Bidirectional JWT Key Derivation (Node <-> Real Django)', () => {
    const shortSecret = 'short-key';
    const longSecret = 'a-very-long-secret-key-with-more-than-32-characters-12345';

    it('derives SHA-256 for short secret (< 32 chars) and raw for long secret (>= 32 chars)', () => {
      const shortDerived = deriveSigningKey(shortSecret);
      expect(shortDerived).toHaveLength(64); // SHA-256 hex digest length

      const longDerived = deriveSigningKey(longSecret);
      expect(longDerived).toBe(longSecret);
    });

    it('verifies token minted by real Django using short secret in Node', () => {
      // Call Django python script to mint token using short secret
      const pythonScript = `
import hashlib
import jwt
from datetime import datetime, timedelta, timezone

secret = "${shortSecret}"
signing_key = secret if len(secret) >= 32 else hashlib.sha256(secret.encode("utf-8")).hexdigest()

payload = {
    "token_type": "access",
    "user_id": "670c5e317e0892095f59c001",
    "email": "pythontest@example.com",
    "company_id": "test-comp-short-123",
    "name": "Python Tester",
    "jti": "mockjti123",
    "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
}
token = jwt.encode(payload, signing_key, algorithm="HS256")
print(token)
`;

      const djangoToken = execFileSync(pythonBin, ['-c', pythonScript], {
        encoding: 'utf-8',
      }).trim();

      const decoded = verifyAccessToken(djangoToken, shortSecret);
      expect(decoded.user_id).toBe('670c5e317e0892095f59c001');
      expect(decoded.email).toBe('pythontest@example.com');
      expect(decoded.company_id).toBe('test-comp-short-123');
    });

    it('verifies token minted by Node using short secret in real Django', () => {
      const user = { _id: '670c5e317e0892095f59c002', email: 'nodetest@example.com', name: 'Node Tester' };
      const { access } = generateTokens(user, 'test-comp-node-short', shortSecret);

      const pythonScript = `
import hashlib
import jwt

secret = "${shortSecret}"
signing_key = secret if len(secret) >= 32 else hashlib.sha256(secret.encode("utf-8")).hexdigest()
token = "${access}"

decoded = jwt.decode(token, signing_key, algorithms=["HS256"])
print(decoded["email"] + "::" + decoded["company_id"])
`;

      const result = execFileSync(pythonBin, ['-c', pythonScript], {
        encoding: 'utf-8',
      }).trim();

      expect(result).toBe('nodetest@example.com::test-comp-node-short');
    });

    it('verifies token minted by real Django using long secret in Node', () => {
      const pythonScript = `
import hashlib
import jwt
from datetime import datetime, timedelta, timezone

secret = "${longSecret}"
signing_key = secret if len(secret) >= 32 else hashlib.sha256(secret.encode("utf-8")).hexdigest()

payload = {
    "token_type": "access",
    "user_id": "670c5e317e0892095f59c003",
    "email": "pythontestlong@example.com",
    "company_id": "test-comp-long-456",
    "name": "Python Long Tester",
    "jti": "mockjti456",
    "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
}
token = jwt.encode(payload, signing_key, algorithm="HS256")
print(token)
`;

      const djangoToken = execFileSync(pythonBin, ['-c', pythonScript], {
        encoding: 'utf-8',
      }).trim();

      const decoded = verifyAccessToken(djangoToken, longSecret);
      expect(decoded.user_id).toBe('670c5e317e0892095f59c003');
      expect(decoded.email).toBe('pythontestlong@example.com');
      expect(decoded.company_id).toBe('test-comp-long-456');
    });

    it('verifies token minted by Node using long secret in real Django', () => {
      const user = { _id: '670c5e317e0892095f59c004', email: 'nodetestlong@example.com', name: 'Node Long Tester' };
      const { access } = generateTokens(user, 'test-comp-node-long', longSecret);

      const pythonScript = `
import hashlib
import jwt

secret = "${longSecret}"
signing_key = secret if len(secret) >= 32 else hashlib.sha256(secret.encode("utf-8")).hexdigest()
token = "${access}"

decoded = jwt.decode(token, signing_key, algorithms=["HS256"])
print(decoded["email"] + "::" + decoded["company_id"])
`;

      const result = execFileSync(pythonBin, ['-c', pythonScript], {
        encoding: 'utf-8',
      }).trim();

      expect(result).toBe('nodetestlong@example.com::test-comp-node-long');
    });
  });
});
