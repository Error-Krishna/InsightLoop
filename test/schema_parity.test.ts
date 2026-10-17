import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Db, MongoClient, ObjectId } from 'mongodb';

describe('Schema Freeze & Parity Audit (Python-Free Safety Net 1)', () => {
  const rootDir = path.resolve(__dirname, '../../..');
  const schemaPath = path.join(rootDir, 'docs/migration/django-model-schema.json');
  const shaPath = path.join(rootDir, 'docs/migration/django-model-schema.json.sha256');

  let schema: Record<string, { collection: string; fields: Record<string, { bson_type: string; required: boolean }> }>;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    // 1. Verify SHA-256 Checksum of Schema Freeze
    const schemaContent = fs.readFileSync(schemaPath);
    const actualSha = crypto.createHash('sha256').update(schemaContent).digest('hex');
    const expectedShaLine = fs.readFileSync(shaPath, 'utf8').trim();
    const expectedSha = expectedShaLine.split(/\s+/)[0];

    expect(actualSha).toBe(expectedSha);
    schema = JSON.parse(schemaContent.toString('utf8'));

    // Connect to test database to inspect documents written by Node
    client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    db = client.db('InsightLoop_test');
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  it('verifies django-model-schema.json has valid frozen checksum', () => {
    expect(schema).toBeDefined();
    expect(Object.keys(schema).length).toBeGreaterThanOrEqual(10);
  });

  function getBsonType(val: unknown): string {
    if (val === null || val === undefined) return 'null';
    if (val instanceof ObjectId) return 'objectId';
    if (val instanceof Date) return 'date';
    if (Array.isArray(val)) return 'array';
    if (typeof val === 'string') {
      if (/^[0-9a-fA-F]{24}$/.test(val)) return 'objectId';
      return 'string';
    }
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'number') {
      return Number.isInteger(val) ? 'int' : 'double';
    }
    if (typeof val === 'object') return 'object';
    return typeof val;
  }

  const collectionsToVerify = [
    'user',
    'company',
    'bills',
    'inventory_items',
    'workers',
    'material_assignments',
    'pay_records',
    'business_data',
    'insights',
  ];

  for (const collName of collectionsToVerify) {
    it(`verifies collection [${collName}] documents conform to frozen Django schema`, async () => {
      const collSchema = schema[collName];
      expect(collSchema).toBeDefined();

      const sampleDocs = await db.collection(collName).find().limit(20).toArray();
      expect(sampleDocs.length).toBeGreaterThan(0);

      for (const doc of sampleDocs) {
        // 1. Check required fields
        for (const [fieldName, fieldMeta] of Object.entries(collSchema.fields)) {
          if (fieldMeta.required && fieldName !== 'id') {
            const hasField = fieldName in doc && doc[fieldName] !== null && doc[fieldName] !== undefined;
            expect(hasField, `Missing required field '${fieldName}' in ${collName} doc ${doc._id}`).toBe(true);
          }
        }

        // 2. Check no extraneous unexpected fields
        for (const [key, val] of Object.entries(doc)) {
          if (key === '_id') continue;
          const allowedField = collSchema.fields[key] || collSchema.fields[key + '_id'];
          expect(
            Boolean(allowedField),
            `Extraneous field '${key}' found in ${collName} doc ${doc._id} not in schema freeze`
          ).toBe(true);

          // 3. Type compatibility
          if (allowedField && val !== null && val !== undefined) {
            const actualType = getBsonType(val);
            const expectedType = allowedField.bson_type;
            const isCompatible =
              actualType === expectedType ||
              (expectedType === 'double' && actualType === 'int') ||
              (expectedType === 'objectId' && actualType === 'string') ||
              (expectedType === 'string' && actualType === 'objectId') ||
              (expectedType === 'object' && actualType === 'object');
            expect(
              isCompatible,
              `Field '${key}' type mismatch in ${collName}: expected ${expectedType}, got ${actualType}`
            ).toBe(true);
          }
        }
      }
    });
  }
});
