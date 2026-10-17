import { Db } from 'mongodb';
import { env, validateEnv } from './env.js';
import { ensureIndexes } from '../db/mongo.js';

export const EXPECTED_SCHEMA_VERSION = 1;

export class StartupInvariantError extends Error {
  constructor(message: string) {
    super(`STARTUP INVARIANT FAILURE: ${message}`);
    this.name = 'StartupInvariantError';
  }
}

const KNOWN_INSECURE_SECRETS = new Set([
  'test-secret-key-must-be-long-enough-32-chars',
  'dev-secret-change-me',
  'changeme',
  'secret',
]);

export async function assertStartupInvariants(
  database: Db,
  options?: {
    jwtSecret?: string;
    nodeEnv?: string;
    expectedVersion?: number;
    skipIndexVerification?: boolean;
    rawEnv?: NodeJS.ProcessEnv;
  }
): Promise<void> {
  const currentEnv = options?.nodeEnv ?? env.NODE_ENV;
  const currentSecret = options?.jwtSecret ?? env.JWT_SECRET;
  const expectedVer = options?.expectedVersion ?? EXPECTED_SCHEMA_VERSION;

  // 1. Validate required environment variables
  try {
    validateEnv(options?.rawEnv ?? process.env);
  } catch (err) {
    throw new StartupInvariantError(`Required environment variables are invalid or missing: ${(err as Error).message}`);
  }

  // 2. Validate JWT secret length and default security
  if (!currentSecret || currentSecret.length < 32) {
    throw new StartupInvariantError('JWT secret is default or <32 chars. Minimum 32 characters required.');
  }
  if (currentEnv === 'production' && KNOWN_INSECURE_SECRETS.has(currentSecret)) {
    throw new StartupInvariantError('JWT secret is default or insecure in production.');
  }

  // 3. Verify MongoDB Reachability
  try {
    await database.command({ ping: 1 });
  } catch (err) {
    throw new StartupInvariantError(`MongoDB cannot be reached: ${(err as Error).message}`);
  }

  // 4. Build and verify MongoDB Indexes
  if (!options?.skipIndexVerification) {
    try {
      await ensureIndexes(database);
      // Verify an essential index actually exists
      const userIndexes = await database.collection('user').indexes();
      const hasEmailIndex = userIndexes.some((idx) => idx.key && 'email' in idx.key);
      if (!hasEmailIndex) {
        throw new Error('user email index verification failed');
      }
    } catch (err) {
      throw new StartupInvariantError(`Mongo indexes cannot be built/verified: ${(err as Error).message}`);
    }
  }

  // 5. Verify Schema Migration Version
  const migrationColl = database.collection('schema_migrations');
  const migrationDoc = await migrationColl.findOne({ name: 'current_version' });
  if (migrationDoc) {
    if (migrationDoc.version !== expectedVer) {
      throw new StartupInvariantError(
        `Schema migration version does not match. Expected version ${expectedVer}, found ${migrationDoc.version}.`
      );
    }
  } else {
    // Initialize current migration version on fresh database
    await migrationColl.updateOne(
      { name: 'current_version' },
      { $set: { version: expectedVer, applied_at: new Date() } },
      { upsert: true }
    );
  }
}
