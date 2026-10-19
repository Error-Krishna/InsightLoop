#!/usr/bin/env node
/**
 * scripts/apply_indexes_additive.mjs
 *
 * Data-Safety Index Script: Additive-Only Index Migration
 *
 * Guaranteed Safe:
 * 1. ONLY calls `createIndex` / `createIndexes`.
 * 2. NEVER calls `dropIndex`, `dropIndexes`, or `dropDatabase`.
 * 3. Idempotent: safe to run multiple times against staging and production.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const { MongoClient } = require(path.join(rootDir, 'apps/api/node_modules/mongodb'));

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/InsightLoop_test';
const dbName = process.env.MONGODB_DB_NAME || 'InsightLoop_test';

console.log(`[INDEX-MIGRATION] Target database: ${dbName}`);
console.log(`[INDEX-MIGRATION] Mode: ADDITIVE-ONLY (no destructive drops)`);

const INDEX_DEFINITIONS = [
  // Authentication & Tenancy
  {
    collection: 'user',
    indexes: [
      { key: { email: 1 }, options: { unique: true } },
      { key: { company: 1 }, options: {} },
    ],
  },
  {
    collection: 'company',
    indexes: [
      { key: { company_id: 1 }, options: { unique: true } },
    ],
  },
  // Bills & Invoices
  {
    collection: 'bills',
    indexes: [
      { key: { company_id: 1, invoice_number: 1 }, options: { unique: true } },
      { key: { company_id: 1, type: 1 }, options: {} },
      { key: { company_id: 1, date: -1 }, options: {} },
      { key: { company_id: 1, payment_status: 1 }, options: {} },
    ],
  },
  // Inventory
  {
    collection: 'inventory_items',
    indexes: [
      { key: { company_id: 1, sku: 1 }, options: { unique: true } },
      { key: { company_id: 1, type: 1 }, options: {} },
      { key: { company_id: 1, name: 1 }, options: {} },
    ],
  },
  {
    collection: 'warehouses',
    indexes: [
      { key: { company_id: 1, name: 1 }, options: {} },
    ],
  },
  // Workers & Distribution
  {
    collection: 'workers',
    indexes: [
      { key: { company_id: 1, name: 1 }, options: {} },
      { key: { company_id: 1, is_active: 1 }, options: {} },
    ],
  },
  {
    collection: 'assignments',
    indexes: [
      { key: { company_id: 1, worker_id: 1 }, options: {} },
      { key: { company_id: 1, status: 1 }, options: {} },
      { key: { company_id: 1, bill_id: 1 }, options: {} },
    ],
  },
  {
    collection: 'material_assignments',
    indexes: [
      { key: { company_id: 1, bill_id: 1 }, options: {} },
    ],
  },
  {
    collection: 'stock_movements',
    indexes: [
      { key: { company_id: 1, bill_id: 1, date: -1 }, options: {} },
    ],
  },
  {
    collection: 'pay_records',
    indexes: [
      { key: { company_id: 1, worker: 1 }, options: {} },
      { key: { company_id: 1, date: -1 }, options: {} },
    ],
  },
  // Uploads & Analytics
  {
    collection: 'business_data',
    indexes: [
      { key: { company_id: 1, date: -1 }, options: {} },
    ],
  },
];

async function applyAdditiveIndexes() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);

    let createdCount = 0;
    for (const def of INDEX_DEFINITIONS) {
      const coll = db.collection(def.collection);
      for (const idx of def.indexes) {
        try {
          const result = await coll.createIndex(idx.key, idx.options);
          console.log(`  ✓ [${def.collection}] Ensured index '${result}'`);
          createdCount++;
        } catch (err) {
          if (err.code === 85 || (err.message && err.message.includes('already exists'))) {
            console.log(`  ℹ [${def.collection}] Equivalent index on ${JSON.stringify(idx.key)} already present.`);
            createdCount++;
          } else {
            console.error(`  ✗ [${def.collection}] Failed index ${JSON.stringify(idx.key)}:`, err.message);
            throw err;
          }
        }
      }
    }

    console.log(`[INDEX-MIGRATION] SUCCESS: ${createdCount} additive indexes verified/created.`);
  } finally {
    await client.close();
  }
}


applyAdditiveIndexes().catch((err) => {
  console.error('[INDEX-MIGRATION] FATAL:', err);
  process.exit(1);
});
