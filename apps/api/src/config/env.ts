import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/InsightLoop_test'),
  MONGODB_DB_NAME: z.string().default('InsightLoop_test'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').default('test-secret-key-must-be-long-enough-32-chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  REDIS_URL: z.string().optional().default(''),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  WHATSAPP_ENABLED: z.coerce.boolean().default(false),
  WHATSAPP_PROVIDER: z.enum(['meta', 'openwa']).default('meta'),
  REHASH_PASSWORDS_ON_LOGIN: z.coerce.boolean().default(false),
});

export const env = envSchema.parse(process.env);

// Runtime safety guards enforcing Non-Negotiable Rule 3
if (env.NODE_ENV === 'test' || process.env.VITEST || process.env.NODE_ENV === 'test') {
  if (!env.MONGODB_DB_NAME.endsWith('_test')) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Test database name must end with '_test'. Got: ${env.MONGODB_DB_NAME}`
    );
  }
  if (!env.MONGODB_URI.includes('localhost') && !env.MONGODB_URI.includes('127.0.0.1')) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Test database host must be local. Got: ${env.MONGODB_URI}`
    );
  }
}
