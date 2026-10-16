import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Db, MongoClient } from 'mongodb';
import {
  assertStartupInvariants,
  StartupInvariantError,
  EXPECTED_SCHEMA_VERSION,
} from '../src/config/startupInvariants.js';

describe('Startup Invariant Assertions (Fail-Fast System Boot Gates)', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    db = client.db('InsightLoop_test_invariants');
  });

  afterAll(async () => {
    if (db) {
      await db.dropDatabase();
    }
    if (client) {
      await client.close();
    }
  });

  it('1. Fails fast if MongoDB cannot be reached', async () => {
    const unreachableDb = {
      command: async () => {
        throw new Error('Connection refused at 127.0.0.1:27999');
      },
      collection: () => ({}),
    } as unknown as Db;

    await expect(assertStartupInvariants(unreachableDb)).rejects.toThrow(StartupInvariantError);
    await expect(assertStartupInvariants(unreachableDb)).rejects.toThrow(/MongoDB cannot be reached/);
  });

  it('2. Fails fast if Mongo indexes cannot be built or verified', async () => {
    const failingIndexDb = {
      command: async () => ({ ok: 1 }),
      collection: (name: string) => ({
        createIndex: async () => {
          throw new Error('Disk full: cannot create index');
        },
        indexes: async () => [],
      }),
    } as unknown as Db;

    await expect(assertStartupInvariants(failingIndexDb)).rejects.toThrow(StartupInvariantError);
    await expect(assertStartupInvariants(failingIndexDb)).rejects.toThrow(/Mongo indexes cannot be built\/verified/);
  });

  it('3. Fails fast if JWT secret is <32 chars or default insecure secret', async () => {
    // Too short
    await expect(
      assertStartupInvariants(db, {
        jwtSecret: 'short-secret-less-than-32',
      })
    ).rejects.toThrow(StartupInvariantError);
    await expect(
      assertStartupInvariants(db, {
        jwtSecret: 'short-secret-less-than-32',
      })
    ).rejects.toThrow(/JWT secret is default or <32 chars/);

    // Default insecure secret in production
    await expect(
      assertStartupInvariants(db, {
        jwtSecret: 'test-secret-key-must-be-long-enough-32-chars',
        nodeEnv: 'production',
      })
    ).rejects.toThrow(StartupInvariantError);
    await expect(
      assertStartupInvariants(db, {
        jwtSecret: 'test-secret-key-must-be-long-enough-32-chars',
        nodeEnv: 'production',
      })
    ).rejects.toThrow(/JWT secret is default or insecure in production/);
  });

  it('4. Fails fast if required environment variables are missing', async () => {
    const brokenEnv: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      MONGODB_URI: '', // Missing in production
      MONGODB_DB_NAME: '',
    };

    await expect(
      assertStartupInvariants(db, {
        rawEnv: brokenEnv,
      })
    ).rejects.toThrow(StartupInvariantError);
    await expect(
      assertStartupInvariants(db, {
        rawEnv: brokenEnv,
      })
    ).rejects.toThrow(/Required environment variables are invalid or missing/);
  });

  it('5. Fails fast if schema migration version does not match', async () => {
    const migrationColl = db.collection('schema_migrations');
    await migrationColl.deleteMany({});
    await migrationColl.insertOne({
      name: 'current_version',
      version: 999999, // Mismatched version
      applied_at: new Date(),
    });

    await expect(
      assertStartupInvariants(db, {
        expectedVersion: EXPECTED_SCHEMA_VERSION,
      })
    ).rejects.toThrow(StartupInvariantError);
    await expect(
      assertStartupInvariants(db, {
        expectedVersion: EXPECTED_SCHEMA_VERSION,
      })
    ).rejects.toThrow(/Schema migration version does not match/);

    // Clean up
    await migrationColl.deleteMany({});
  });

  it('passes cleanly when all startup invariants are satisfied', async () => {
    await expect(
      assertStartupInvariants(db, {
        jwtSecret: 'a-valid-production-secret-with-more-than-32-characters-length',
        nodeEnv: 'development',
        expectedVersion: EXPECTED_SCHEMA_VERSION,
      })
    ).resolves.toBeUndefined();
  });
});
