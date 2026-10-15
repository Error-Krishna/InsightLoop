import { Db, MongoClient } from 'mongodb';
import { env } from '../config/env.js';

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

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);

  console.log(`Connected to MongoDB: ${dbName}`);
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectMongo() first.');
  }
  return db;
}

export function getCollection<T extends import('mongodb').Document = import('mongodb').Document>(name: string) {
  return getDb().collection<T>(name);
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
