import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo, getDb, getCollection } from '../src/db/mongo.js';
import { generateTokens } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';
import { app } from '../src/app.js';

export { getDb, getDb as getDatabase, getCollection };

let replSet: MongoMemoryReplSet | null = null;

export async function setupTestDb(): Promise<void> {
  if (!replSet) {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectMongo(uri, 'InsightLoop_test');
  }
}

export function getTestDbUri(): string | null {
  return replSet ? replSet.getUri() : null;
}

export async function teardownTestDb(): Promise<void> {
  await clearDatabase();
}

process.on('exit', () => {
  if (replSet) {
    void replSet.stop();
    replSet = null;
  }
});

export async function clearDatabase(): Promise<void> {
  await setupTestDb();
  const db = getDb();
  const collections = await db.collections();
  for (const col of collections) {
    await col.deleteMany({});
  }
}

export interface TestUserContext {
  userId: string;
  email: string;
  companyId: string;
  token: string;
  refreshToken: string;
}

export async function createTestUser(options: { companyId?: string; email?: string; password?: string } = {}): Promise<TestUserContext> {
  const companyId = options.companyId ?? new ObjectId().toString();
  const email = options.email ?? `user_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
  const password = options.password ?? 'ValidPass123!';
  const hashedPassword = hashPassword(password);
  const userId = new ObjectId();
  const compObjectId = typeof companyId === 'string' && ObjectId.isValid(companyId) ? new ObjectId(companyId) : new ObjectId();

  const companyCol = getCollection('company');
  await companyCol.updateOne(
    { company_id: companyId },
    {
      $setOnInsert: {
        _id: compObjectId,
        company_id: companyId,
        name: 'Test Company',
        business_type: 'Manufacturing',
        created_at: new Date(),
        updated_at: new Date(),
      },
    },
    { upsert: true }
  );

  const existingComp = await companyCol.findOne({ company_id: companyId });
  const compRef = existingComp?._id ?? compObjectId;

  const usersCol = getCollection('user');
  await usersCol.insertOne({
    _id: userId,
    email,
    name: 'Test User',
    password: hashedPassword,
    company: compRef,
    created_at: new Date(),
  });

  const { access, refresh } = generateTokens(
    { _id: userId, email, name: 'Test User' },
    companyId
  );

  return {
    userId: userId.toString(),
    email,
    companyId,
    token: access,
    refreshToken: refresh,
  };
}

export { app };
