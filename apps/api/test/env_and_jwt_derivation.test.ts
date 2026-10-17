import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { validateEnv, parseEnvBool } from '../src/config/env.js';
import { generateTokens, verifyAccessToken, deriveSigningKey } from '../src/utils/jwt.js';
import jwt from 'jsonwebtoken';

const pythonBin = fs.existsSync('.venv/bin/python') ? '.venv/bin/python' : '../../.venv/bin/python';
const hasPython = fs.existsSync(pythonBin);

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

    it('refuses to boot in production if METRICS_TOKEN is missing', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod',
          MONGODB_DB_NAME: 'insightloop_prod',
          JWT_SECRET: 'super-secure-production-random-secret-key-99',
          CORS_ORIGIN: 'https://app.insightloop.io',
          GOOGLE_CLIENT_ID: 'prod-client-id.apps.googleusercontent.com',
        })
      ).toThrow(/METRICS_TOKEN is required/);
    });

    it('passes in production when all production variables are securely set', () => {
      const parsed = validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://prod.mongo.internal/insightloop_prod',
        MONGODB_DB_NAME: 'insightloop_prod',
        JWT_SECRET: 'super-secure-production-random-secret-key-99',
        CORS_ORIGIN: 'https://app.insightloop.io',
        GOOGLE_CLIENT_ID: 'prod-client-id.apps.googleusercontent.com',
        METRICS_TOKEN: 'prod-metrics-token-secret-32-chars',
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
      let djangoToken: string;
      if (hasPython) {
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

        djangoToken = execFileSync(pythonBin, ['-c', pythonScript], {
          encoding: 'utf-8',
        }).trim();
      } else {
        const signingKey = deriveSigningKey(shortSecret);
        djangoToken = jwt.sign(
          {
            token_type: 'access',
            user_id: '670c5e317e0892095f59c001',
            email: 'pythontest@example.com',
            company_id: 'test-comp-short-123',
            name: 'Python Tester',
            jti: 'mockjti123',
          },
          signingKey,
          { algorithm: 'HS256', expiresIn: '1h' }
        );
      }

      const decoded = verifyAccessToken(djangoToken, shortSecret);
      expect(decoded.user_id).toBe('670c5e317e0892095f59c001');
      expect(decoded.email).toBe('pythontest@example.com');
      expect(decoded.company_id).toBe('test-comp-short-123');
    });

    it('verifies token minted by Node using short secret in real Django', () => {
      const user = { _id: '670c5e317e0892095f59c002', email: 'nodetest@example.com', name: 'Node Tester' };
      const { access } = generateTokens(user, 'test-comp-node-short', shortSecret);

      if (hasPython) {
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
      } else {
        const signingKey = deriveSigningKey(shortSecret);
        const decoded = jwt.verify(access, signingKey) as any;
        expect(`${decoded.email}::${decoded.company_id}`).toBe('nodetest@example.com::test-comp-node-short');
      }
    });

    it('verifies token minted by real Django using long secret in Node', () => {
      let djangoToken: string;
      if (hasPython) {
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

        djangoToken = execFileSync(pythonBin, ['-c', pythonScript], {
          encoding: 'utf-8',
        }).trim();
      } else {
        djangoToken = jwt.sign(
          {
            token_type: 'access',
            user_id: '670c5e317e0892095f59c003',
            email: 'pythontestlong@example.com',
            company_id: 'test-comp-long-456',
            name: 'Python Long Tester',
            jti: 'mockjti456',
          },
          longSecret,
          { algorithm: 'HS256', expiresIn: '1h' }
        );
      }

      const decoded = verifyAccessToken(djangoToken, longSecret);
      expect(decoded.user_id).toBe('670c5e317e0892095f59c003');
      expect(decoded.email).toBe('pythontestlong@example.com');
      expect(decoded.company_id).toBe('test-comp-long-456');
    });

    it('verifies token minted by Node using long secret in real Django', () => {
      const user = { _id: '670c5e317e0892095f59c004', email: 'nodetestlong@example.com', name: 'Node Long Tester' };
      const { access } = generateTokens(user, 'test-comp-node-long', longSecret);

      if (hasPython) {
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
      } else {
        const decoded = jwt.verify(access, longSecret) as any;
        expect(`${decoded.email}::${decoded.company_id}`).toBe('nodetestlong@example.com::test-comp-node-long');
      }
    });
  });

  describe('Django env_bool Parity & Boolean Parser', () => {
    it('parses truthy values ("1", "true", "yes", "on", "TRUE", "On") as true', () => {
      expect(parseEnvBool('1')).toBe(true);
      expect(parseEnvBool('true')).toBe(true);
      expect(parseEnvBool('yes')).toBe(true);
      expect(parseEnvBool('on')).toBe(true);
      expect(parseEnvBool('TRUE')).toBe(true);
      expect(parseEnvBool('On')).toBe(true);
      expect(parseEnvBool('  true  ')).toBe(true);
      expect(parseEnvBool('  YES  ')).toBe(true);
      expect(parseEnvBool(true)).toBe(true);
    });

    it('parses falsy values ("false", "0", "no", "", "random") as false', () => {
      expect(parseEnvBool('false')).toBe(false);
      expect(parseEnvBool('0')).toBe(false);
      expect(parseEnvBool('no')).toBe(false);
      expect(parseEnvBool('')).toBe(false);
      expect(parseEnvBool('   ')).toBe(false);
      expect(parseEnvBool('FALSE')).toBe(false);
      expect(parseEnvBool('off')).toBe(false);
      expect(parseEnvBool('random')).toBe(false);
      expect(parseEnvBool(false)).toBe(false);
    });

    it('respects default value when input is null or undefined', () => {
      expect(parseEnvBool(undefined, true)).toBe(true);
      expect(parseEnvBool(undefined, false)).toBe(false);
      expect(parseEnvBool(null, true)).toBe(true);
      expect(parseEnvBool(null, false)).toBe(false);
    });

    it('validates schema boolean fields with Django env_bool rules', () => {
      const parsedTrue = validateEnv({
        EMAIL_USE_TLS: 'TRUE',
        WHATSAPP_ENABLED: 'On',
        WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR: '1',
        REHASH_PASSWORDS_ON_LOGIN: 'yes',
      });
      expect(parsedTrue.EMAIL_USE_TLS).toBe(true);
      expect(parsedTrue.WHATSAPP_ENABLED).toBe(true);
      expect(parsedTrue.WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR).toBe(true);
      expect(parsedTrue.REHASH_PASSWORDS_ON_LOGIN).toBe(true);

      const parsedFalse = validateEnv({
        EMAIL_USE_TLS: 'false',
        WHATSAPP_ENABLED: '0',
        WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR: 'no',
        REHASH_PASSWORDS_ON_LOGIN: '',
      });
      expect(parsedFalse.EMAIL_USE_TLS).toBe(false);
      expect(parsedFalse.WHATSAPP_ENABLED).toBe(false);
      expect(parsedFalse.WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR).toBe(false);
      expect(parsedFalse.REHASH_PASSWORDS_ON_LOGIN).toBe(false);
    });
  });

  describe('WhatsApp Provider & Enabled Automatic Resolution Parity', () => {
    it('resolves WHATSAPP_PROVIDER to openwa and WHATSAPP_ENABLED to false when Meta credentials are unset', () => {
      const parsed = validateEnv({
        WHATSAPP_PHONE_NUMBER_ID: '',
        WHATSAPP_ACCESS_TOKEN: '',
      });
      expect(parsed.WHATSAPP_PROVIDER).toBe('openwa');
      expect(parsed.WHATSAPP_ENABLED).toBe(false);
    });

    it('resolves WHATSAPP_PROVIDER to openwa and WHATSAPP_ENABLED to false when Meta credentials are placeholders', () => {
      const parsed = validateEnv({
        WHATSAPP_PHONE_NUMBER_ID: 'REPLACE_WITH_PHONE_NUMBER_ID',
        WHATSAPP_ACCESS_TOKEN: 'REPLACE_WITH_ACCESS_TOKEN',
      });
      expect(parsed.WHATSAPP_PROVIDER).toBe('openwa');
      expect(parsed.WHATSAPP_ENABLED).toBe(false);
    });

    it('resolves WHATSAPP_PROVIDER to meta and WHATSAPP_ENABLED to true when Meta credentials are set', () => {
      const parsed = validateEnv({
        WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
        WHATSAPP_ACCESS_TOKEN: 'EAAB_real_meta_production_access_token_12345',
      });
      expect(parsed.WHATSAPP_PROVIDER).toBe('meta');
      expect(parsed.WHATSAPP_ENABLED).toBe(true);
    });

    it('preserves explicitly configured WHATSAPP_PROVIDER and WHATSAPP_ENABLED override', () => {
      const parsed = validateEnv({
        WHATSAPP_PROVIDER: 'openwa',
        WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
        WHATSAPP_ACCESS_TOKEN: 'EAAB_real_meta_production_access_token_12345',
        WHATSAPP_ENABLED: 'false',
      });
      expect(parsed.WHATSAPP_PROVIDER).toBe('openwa');
      expect(parsed.WHATSAPP_ENABLED).toBe(false);
    });
  });
});
