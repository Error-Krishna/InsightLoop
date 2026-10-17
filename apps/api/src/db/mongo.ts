import { AsyncLocalStorage } from 'node:async_hooks';
import { Db, MongoClient } from 'mongodb';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface RequestMetricsContext {
  mongoDurationMs: number;
}

export const requestMetricsStorage = new AsyncLocalStorage<RequestMetricsContext>();
const commandStoreMap = new Map<number, RequestMetricsContext>();

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(customUri?: string, customDbName?: string): Promise<Db> {
  if (db && client) return db;

  const uri = customUri ?? env.MONGODB_URI;
  const dbName = customDbName ?? env.MONGODB_DB_NAME;

  // Runtime safety guard (Rule 3)
  if (env.NODE_ENV === 'test' || dbName.endsWith('_test')) {
    if (!dbName.endsWith('_test')) {
      throw new Error(`REFUSING: DB name must end in '_test'. Got: ${dbName}`);
    }
    if (!uri.includes('localhost') && !uri.includes('127.0.0.1')) {
      throw new Error(`REFUSING: Host must be local. Got: ${uri}`);
    }
  }

  client = new MongoClient(uri, { monitorCommands: true });

  client.on('commandStarted', (event) => {
    const store = requestMetricsStorage.getStore();
    if (store) {
      commandStoreMap.set(event.requestId, store);
    }
  });

  client.on('commandSucceeded', (event) => {
    const store = commandStoreMap.get(event.requestId);
    if (store) {
      commandStoreMap.delete(event.requestId);
      store.mongoDurationMs += event.duration;
    }
  });

  client.on('commandFailed', (event) => {
    const store = commandStoreMap.get(event.requestId);
    if (store) {
      commandStoreMap.delete(event.requestId);
      store.mongoDurationMs += event.duration;
    }
  });

  await client.connect();
  db = client.db(dbName);
  await ensureIndexes(db);

  // Measure MongoDB round-trip latency at startup (Section 1.3)
  let pingMs = 0;
  let findOneMs = 0;
  try {
    const pingStart = performance.now();
    await db.command({ ping: 1 });
    pingMs = Math.round((performance.now() - pingStart) * 100) / 100;

    const findStart = performance.now();
    await db.collection('schema_migrations').findOne({});
    findOneMs = Math.round((performance.now() - findStart) * 100) / 100;
  } catch {
    // SILENT-FALLBACK-REASON: Non-fatal if schema_migrations does not exist yet
  }

  let sanitizedHost = 'localhost';
  try {
    const match = /@([^/?#]+)/.exec(uri);
    if (match) {
      sanitizedHost = match[1];
    } else {
      const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
      sanitizedHost = parsed.host;
    }
  } catch {
    // SILENT-FALLBACK-REASON: Fallback to localhost if URI host parsing fails
  }

  logger.info({ dbName, host: sanitizedHost, pingMs, findOneMs }, 'Connected to MongoDB & verified round-trip latency');
  return db;
}

export async function ensureIndexes(database: Db): Promise<void> {
  await database.collection('user').createIndex({ email: 1 }, { unique: true });
  await database.collection('company').createIndex({ company_id: 1 }, { unique: true });
  await database.collection('bills').createIndex({ company_id: 1, invoice_number: 1 }, { unique: true });
  await database.collection('bills').createIndex({ company_id: 1, type: 1, date: -1 });
  await database.collection('bills').createIndex({ company_id: 1, profit_confirmed_at: 1 });
  await database.collection('inventory_items').createIndex({ company_id: 1, sku: 1 }, { unique: true });
  await database.collection('inventory_items').createIndex({ company_id: 1, type: 1 });
  await database.collection('workers').createIndex({ company_id: 1, is_active: 1, created_at: -1 });
  await database.collection('material_assignments').createIndex({ company_id: 1, worker: 1 });
  await database.collection('material_assignments').createIndex({ company_id: 1, worker_id: 1 });
  await database.collection('material_assignments').createIndex({ company_id: 1, bill_id: 1, status: 1 });
  await database.collection('pay_records').createIndex({ company_id: 1, worker: 1 });
  await database.collection('pay_records').createIndex({ company_id: 1, worker_id: 1 });
  await database.collection('pay_records').createIndex({ company_id: 1, date: 1 });
  await database.collection('business_data').createIndex({ company_id: 1, date: 1 });

  // Additive indexes for query acceleration (Section 2.2)
  await database.collection('bills').createIndex({ company_id: 1, created_at: -1 });
  await database.collection('bills').createIndex({ company_id: 1, bill_type: 1, created_at: -1 });
  await database.collection('bills').createIndex({ company_id: 1, profit_confirmed: 1, profit_confirmed_at: 1 });
  await database.collection('inventory_items').createIndex({ company_id: 1, type: 1, updated_at: -1, _id: -1 });
  await database.collection('warehouses').createIndex({ company_id: 1, name: 1 });
  await database.collection('workers').createIndex({ company_id: 1, created_at: -1 });
  await database.collection('insights').createIndex({ company_id: 1, created_at: -1 });
  await database.collection('pay_records').createIndex({ company_id: 1, date: -1 });
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectMongo() first.');
  }
  return db;
}

export function getClient(): MongoClient | null {
  return client;
}

export function getCollection<T extends import('mongodb').Document = import('mongodb').Document>(name: string) {
  return getDb().collection<T>(name);
}

export async function closeMongo(force = false): Promise<void> {
  if (client) {
    const c = client;
    client = null;
    db = null;
    try {
      await c.close(force);
    } catch {
      // SILENT-FALLBACK-REASON: Pool connection interruptions during shutdown are safely swallowed
    }
  }
}
