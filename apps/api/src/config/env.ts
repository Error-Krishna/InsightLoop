import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const KNOWN_INSECURE_SECRETS = new Set([
  'test-secret-key-must-be-long-enough-32-chars',
  'dev-secret-change-me',
  'changeme',
  'secret',
]);

export function getEnvSchema(isProduction: boolean) {
  return z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    HOST: z.string().default('0.0.0.0'),
    MONGODB_URI: isProduction
      ? z.string({ required_error: 'MONGODB_URI is required in production.' }).min(1, 'MONGODB_URI is required in production.')
      : z.string().default('mongodb://localhost:27017/InsightLoop_test'),
    MONGODB_DB_NAME: isProduction
      ? z.string({ required_error: 'MONGODB_DB_NAME is required in production.' }).min(1, 'MONGODB_DB_NAME is required in production.')
      : z.string().default('InsightLoop_test'),
    JWT_SECRET: isProduction
      ? z.string({ required_error: 'JWT_SECRET is required in production.' }).min(1, 'JWT_SECRET is required in production.')
      : z.string().default('test-secret-key-must-be-long-enough-32-chars'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('1h'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    REDIS_URL: z.string().optional().default(''),
    CORS_ORIGIN: isProduction
      ? z.string({ required_error: 'CORS_ORIGIN is required in production.' }).min(1, 'CORS_ORIGIN is required in production.')
      : z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
    UPLOAD_DIR: z.string().default('./uploads'),
    MAX_FILE_SIZE_MB: z.coerce.number().default(10),
    WHATSAPP_ENABLED: z.coerce.boolean().default(false),
    WHATSAPP_PROVIDER: z.enum(['meta', 'openwa']).default('meta'),
    REHASH_PASSWORDS_ON_LOGIN: z.coerce.boolean().default(false),
    GOOGLE_CLIENT_ID: isProduction
      ? z.string({ required_error: 'GOOGLE_CLIENT_ID is required in production.' }).min(1, 'GOOGLE_CLIENT_ID is required in production.')
      : z.string().default('mock-google-client-id'),
    APP_TIME_ZONE: z.string().default('Asia/Kolkata'),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(10),
    TRUST_PROXY: z.string().default('1'),
    STORAGE_DRIVER: z.enum(['gridfs', 's3', 'local']).default('gridfs'),
    S3_BUCKET_NAME: z.string().optional().default(''),
    AWS_REGION: z.string().optional().default(''),
    AWS_ACCESS_KEY_ID: z.string().optional().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
    OPENWA_API_KEY: z.string().optional().default(''),
    OPENWA_BASE_URL: z.string().optional().default(''),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
    WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
    WHATSAPP_API_VERSION: z.string().default('v18.0'),
    WHATSAPP_BILL_TEMPLATE_NAME: z.string().default('bill_share'),
    GOOGLE_TOKENINFO_URL: z.string().default('https://oauth2.googleapis.com/tokeninfo'),
    SERVE_STATIC: z.string().optional().default('false'),
    EMAIL_HOST: z.string().default('localhost'),
    EMAIL_PORT: z.coerce.number().default(1025),
    DEFAULT_FROM_EMAIL: z.string().default('noreply@insightloop.io'),
    ADMIN_EMAIL: z.string().default('admin@insightloop.io'),
  });
}

export function validateEnv(raw: NodeJS.ProcessEnv = process.env) {
  const isProd = raw.NODE_ENV === 'production';
  const schema = getEnvSchema(isProd);
  const parsed = schema.parse(raw);

  if (isProd) {
    if (KNOWN_INSECURE_SECRETS.has(parsed.JWT_SECRET)) {
      throw new Error(
        `CRITICAL SECURITY VIOLATION: Refusing to boot in production with default/insecure JWT_SECRET.`
      );
    }
    if (parsed.MONGODB_DB_NAME.endsWith('_test')) {
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Production database name cannot end with '_test'. Got: ${parsed.MONGODB_DB_NAME}`
      );
    }
    if (!parsed.CORS_ORIGIN) {
      throw new Error('CRITICAL CONFIGURATION ERROR: CORS_ORIGIN is required in production.');
    }
    if (!parsed.GOOGLE_CLIENT_ID) {
      throw new Error('CRITICAL CONFIGURATION ERROR: GOOGLE_CLIENT_ID is required in production.');
    }
  }

  // Runtime safety guards enforcing Non-Negotiable Rule 3 in test mode
  if (parsed.NODE_ENV === 'test' || raw.VITEST || raw.NODE_ENV === 'test') {
    if (!parsed.MONGODB_DB_NAME.endsWith('_test')) {
      /* v8 ignore start */
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Test database name must end with '_test'. Got: ${parsed.MONGODB_DB_NAME}`
      );
      /* v8 ignore stop */
    }
    if (
      !parsed.MONGODB_URI.includes('localhost') &&
      !parsed.MONGODB_URI.includes('127.0.0.1') &&
      !parsed.MONGODB_URI.includes('host.docker.internal')
    ) {
      /* v8 ignore start */
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Test database host must be local. Got: ${parsed.MONGODB_URI}`
      );
      /* v8 ignore stop */
    }
  }

  return parsed;
}

export const env = validateEnv(process.env);
