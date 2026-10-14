import { Db, MongoClient } from 'mongodb';
import { env } from '../config/env.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db && client) return db;

  // Runtime safety guard (Rule 3)
  if (env.NODE_ENV === 'test' || env.MONGODB_DB_NAME.endsWith('_test')) {
    if (!env.MONGODB_DB_NAME.endsWith('_test')) {
      throw new Error(`REFUSING: DB name must end in '_test'. Got: ${env.MONGODB_DB_NAME}`);
    }
    if (!env.MONGODB_URI.includes('localhost') && !env.MONGODB_URI.includes('127.0.0.1')) {
      throw new Error(`REFUSING: Host must be local. Got: ${env.MONGODB_URI}`);
    }
  }

  client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  db = client.db(env.MONGODB_DB_NAME);

  console.log(`Connected to MongoDB: ${env.MONGODB_DB_NAME}`);
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
