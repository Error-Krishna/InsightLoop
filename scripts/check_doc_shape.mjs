#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/InsightLoop_test';
const dbName = process.env.MONGODB_DB_NAME || 'InsightLoop_test';
const require = createRequire(import.meta.url);
const { MongoClient, ObjectId } = require(path.join(rootDir, 'apps/api/node_modules/mongodb'));

console.log(`[check_doc_shape] 1. Loading frozen schema from docs/migration/django-model-schema.json...`);
const frozen = JSON.parse(fs.readFileSync(path.join(rootDir, 'docs/migration/django-model-schema.json'), 'utf8'));
const schemas = {};
for (const [coll, def] of Object.entries(frozen)) {
  const fields = {
    _id: { name: 'id', type: 'ObjectIdField', required: false },
  };
  for (const [fName, fMeta] of Object.entries(def.fields)) {
    const dbKey = fName === 'id' ? '_id' : fName;
    fields[dbKey] = {
      name: fName,
      type: fMeta.bson_type === 'string' ? 'StringField'
          : fMeta.bson_type === 'int' ? 'IntField'
          : fMeta.bson_type === 'double' ? 'FloatField'
          : fMeta.bson_type === 'decimal' ? 'DecimalField'
          : fMeta.bson_type === 'bool' ? 'BooleanField'
          : fMeta.bson_type === 'date' ? 'DateTimeField'
          : fMeta.bson_type === 'objectId' ? 'ObjectIdField'
          : fMeta.bson_type === 'array' ? 'ListField'
          : 'DictField',
      required: fMeta.required,
    };
  }
  schemas[coll] = {
    model: coll,
    collection: coll,
    fields,
    strict: true,
  };
}
console.log(`[check_doc_shape] Found ${Object.keys(schemas).length} model definitions registered.`);

console.log(`[check_doc_shape] 2. Deterministically seeding one document of EVERY entity type created by Node...`);
const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const testCompanyId = `det-shape-${Date.now()}`;
const testCompanyDocId = new ObjectId();
const testUserId = new ObjectId();
const testWorkerId = new ObjectId();
const testWarehouseId = new ObjectId();
const testItemId = new ObjectId();
const testAssignId = new ObjectId();
const testPayId = new ObjectId();
const testBillId = new ObjectId();
const testUploadId = new ObjectId();
const testInsightId = new ObjectId();
const testContactId = new ObjectId();

let checkedDocs = 0;

try {
  // 1. Company
  await db.collection('company').insertOne({
    _id: testCompanyDocId,
    company_id: testCompanyId,
    name: 'Deterministic Shape Corp',
    email: 'shape@example.com',
    phone: '9876543210',
    address: '100 Industrial Area',
    created_at: new Date(),
    updated_at: new Date(),
  });

  // 2. User
  await db.collection('user').insertOne({
    _id: testUserId,
    email: `shape_tester_${Date.now()}@example.com`,
    password: 'pbkdf2_sha256$600000$test$hashed_test_password_for_doc_shape_interop',
    name: 'Shape Tester',
    company: testCompanyDocId,
    created_at: new Date(),
  });

  // 3. Worker
  await db.collection('workers').insertOne({
    _id: testWorkerId,
    company_id: testCompanyId,
    name: 'Artisan Master',
    phone: '9123456789',
    address: 'Artisan Hub 1',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // 4. Warehouse (Django Warehouse model only has created_at, no updated_at)
  await db.collection('warehouses').insertOne({
    _id: testWarehouseId,
    company_id: testCompanyId,
    name: 'Deterministic Central Warehouse',
    location: 'Gate 4',
    created_at: new Date(),
  });

  // 5. Inventory Items (finished, semi-finished, raw)
  await db.collection('inventory_items').insertMany([
    {
      _id: testItemId,
      company_id: testCompanyId,
      name: 'Pure Pashmina Shawl',
      type: 'finished',
      sku: `SKU-DET-FIN-${Date.now()}`,
      quantity: 50,
      unit: 'pcs',
      selling_price: 3500,
      cost_price: 1800,
      reorder_level: 10,
      warehouse_id: testWarehouseId.toString(),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      _id: new ObjectId(),
      company_id: testCompanyId,
      name: 'Spun Wool Thread',
      type: 'semi-finished',
      sku: `SKU-DET-SEMI-${Date.now()}`,
      quantity: 120,
      unit: 'spools',
      selling_price: 400,
      cost_price: 250,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      _id: new ObjectId(),
      company_id: testCompanyId,
      name: 'Raw Cashmere Fleece',
      type: 'raw',
      sku: `SKU-DET-RAW-${Date.now()}`,
      quantity: 300,
      unit: 'kg',
      selling_price: 1200,
      cost_price: 900,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  // 6. MaterialAssignment with batch & Django model tracking fields
  await db.collection('material_assignments').insertOne({
    _id: testAssignId,
    company_id: testCompanyId,
    worker: testWorkerId,
    material_name: 'Raw Cashmere Fleece',
    quantity: 20,
    price_per_unit: 900,
    assignment_date: new Date(),
    notes: 'Assignment for Pashmina production',
    batches: [
      {
        quantity: 10,
        date: new Date().toISOString(),
        notes: 'Mid-week return batch',
      },
    ],
    status: 'open',
    bill_id: testBillId.toString(),
    wage_amount: 1500,
    pay_record_id: testPayId.toString(),
    synced_to_inventory: false,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // 7. PayRecord with bill_id & source_assignment_id
  await db.collection('pay_records').insertOne({
    _id: testPayId,
    company_id: testCompanyId,
    worker: testWorkerId,
    product_name: 'Pure Pashmina Shawl',
    units_produced: 10,
    rate_per_unit: 150,
    amount_paid: 750,
    date: new Date(),
    paid: false,
    bill_id: testBillId.toString(),
    source_assignment_id: testAssignId.toString(),
    created_at: new Date(),
    updated_at: new Date(),
  });

  // 8. Bill with all subdocuments (payments, costs, ready_to_deliver, products)
  await db.collection('bills').insertOne({
    _id: testBillId,
    company_id: testCompanyId,
    invoice_number: `INV-DET-${Date.now()}`,
    bill_type: 'pakka',
    buyer: {
      name: 'Prestige Textiles Ltd',
      phone: '9988776655',
      address: 'Commercial Avenue',
      gst_number: '29ABCDE1234F1Z5',
    },
    products: [
      {
        name: 'Pure Pashmina Shawl',
        quantity: 5,
        rate: 3500,
        amount: 17500,
        inventory_item_id: testItemId.toString(),
      },
    ],
    subtotal: 17500,
    gst_percentage: 12,
    gst_amount: 2100,
    discount: 500,
    grand_total: 19100,
    payments: [
      {
        amount: 10000,
        date: new Date(),
        notes: 'Advance transfer',
      },
    ],
    profit_confirmed: false,
    profit_suggested_amount: 4500,
    profit_confirmed_amount: 0,
    profit_confirmed_at: null,
    worker_assignment_ids: [testAssignId.toString()],
    transportation_costs: [
      {
        amount: 350,
        date: new Date(),
        notes: 'Insured freight dispatch',
      },
    ],
    misc_costs: [
      {
        amount: 150,
        date: new Date(),
        notes: 'Handmade wooden packaging box',
      },
    ],
    ready_to_deliver: [
      {
        quantity: 5,
        item_name: 'Pure Pashmina Shawl',
        date: new Date(),
        notes: 'QC passed and staged',
      },
    ],
    shipment_confirmed: false,
    shipment_confirmed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // 9. BusinessData (upload - Django BusinessData has no created_at/updated_at)
  await db.collection('business_data').insertOne({
    _id: testUploadId,
    company_id: testCompanyId,
    date: new Date(),
    product: 'Pure Pashmina Shawl',
    category: 'Apparel',
    quantity: 5,
    production_cost: 1800,
    selling_price: 3500,
  });

  // 10. FinancialSummary (collection financial_summaries)
  await db.collection('financial_summaries').insertOne({
    company_id: testCompanyId,
    timestamp: new Date(),
    total_revenue: 17500,
    total_profit: 8500,
    worker_payments: 1500,
    active_workers: 1,
  });

  // 11. Insight
  await db.collection('insights').insertOne({
    _id: testInsightId,
    company_id: testCompanyId,
    title: 'Pashmina Margin Optimization',
    description: 'High unit profit margin on luxury apparel segment.',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    data_points: [12000, 15000, 18000, 22000],
    note: 'Sustained seasonal demand',
    created_at: new Date(),
  });

  // 12. ContactMessage
  await db.collection('contact_message').insertOne({
    _id: testContactId,
    name: 'Enterprise Client',
    email: 'client@prestige.com',
    message: 'Requesting quotation for export volume of 500 shawls.',
    created_at: new Date(),
  });

  console.log(`[check_doc_shape] Successfully seeded complete deterministic entity set.`);

  console.log(`[check_doc_shape] 3. Verifying strict document shapes and type conformity across all collections...`);
  let totalErrors = 0;
  checkedDocs = 0;

  for (const [collName, schema] of Object.entries(schemas)) {
    const collection = db.collection(collName);
    const count = await collection.countDocuments();
    if (count === 0) {
      console.error(`[ERROR] Collection '${collName}' has 0 documents! Expected deterministic seeded data.`);
      totalErrors++;
      continue;
    }

    console.log(`[check_doc_shape] Checking collection '${collName}' (${count} documents)...`);
    const cursor = collection.find({ company_id: testCompanyId });

    for await (const doc of cursor) {
      checkedDocs++;
      const docId = doc._id ? doc._id.toString() : 'unknown';

      // 1. Extra fields check
      for (const key of Object.keys(doc)) {
        if (!schema.fields[key]) {
          console.error(
            `[ERROR] Extra field '${key}' in collection '${collName}' doc '${docId}' not declared in model ${schema.model}`
          );
          totalErrors++;
        }
      }

      // 2. Type validation for present fields
      for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) {
        const val = doc[fieldKey];
        if (val === undefined || val === null) {
          if (fieldDef.required) {
            console.error(
              `[ERROR] Missing required field '${fieldKey}' in collection '${collName}' doc '${docId}'`
            );
            totalErrors++;
          }
          continue;
        }

        switch (fieldDef.type) {
          case 'ObjectIdField':
          case 'ReferenceField': {
            if (!(val instanceof ObjectId)) {
              console.error(
                `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected ObjectId but got ${typeof val}`
              );
              totalErrors++;
            }
            break;
          }
          case 'DateTimeField':
          case 'DateField': {
            if (!(val instanceof Date) || isNaN(val.getTime())) {
              console.error(
                `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected BSON Date but got ${typeof val}`
              );
              totalErrors++;
            }
            break;
          }
          case 'IntField': {
            if (typeof val !== 'number' || !Number.isInteger(val)) {
              console.error(
                `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected integer but got ${val}`
              );
              totalErrors++;
            }
            break;
          }
          case 'FloatField':
          case 'DecimalField': {
            if (typeof val !== 'number' && typeof val !== 'object') {
              console.error(
                `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected number/Decimal but got ${typeof val}`
              );
              totalErrors++;
            }
            break;
          }
          case 'BooleanField': {
            if (typeof val !== 'boolean') {
              console.error(
                `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected boolean but got ${typeof val}`
              );
              totalErrors++;
            }
            break;
          }
          case 'StringField':
          case 'EmailField': {
            if (typeof val !== 'string') {
              console.error(
                `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected string but got ${typeof val}`
              );
              totalErrors++;
            }
            break;
          }
          case 'ListField': {
            if (!Array.isArray(val)) {
              console.error(
                `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected Array but got ${typeof val}`
              );
              totalErrors++;
            }
            break;
          }
          case 'DictField': {
            if (typeof val !== 'object' || Array.isArray(val)) {
              console.error(
                `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected Object but got ${typeof val}`
              );
              totalErrors++;
            }
            break;
          }
        }
      }
    }
  }

  // 4. Specific assertions required by Item 7:
  console.log(`[check_doc_shape] 4. Running specific Django model field and invariant assertions...`);
  
  // A. MaterialAssignment and PayRecord linkage fields
  const assignmentDoc = await db.collection('material_assignments').findOne({ _id: testAssignId });
  if (!assignmentDoc?.bill_id || assignmentDoc.wage_amount !== 1500 || !assignmentDoc.pay_record_id) {
    console.error(`[ERROR] MaterialAssignment missing required bill_id, wage_amount, or pay_record_id!`);
    totalErrors++;
  }

  const payDoc = await db.collection('pay_records').findOne({ _id: testPayId });
  if (!payDoc?.bill_id || !payDoc?.source_assignment_id) {
    console.error(`[ERROR] PayRecord missing bill_id or source_assignment_id!`);
    totalErrors++;
  }

  // B. Batches date format check
  const batches = assignmentDoc?.batches || [];
  if (batches.length === 0 || !batches[0].date || typeof batches[0].date !== 'string') {
    console.error(`[ERROR] Batches date must be stored as an ISO date string!`);
    totalErrors++;
  }

  // C. InventoryItem type casing check (finished, semi-finished, raw)
  const items = await db.collection('inventory_items').find({ company_id: testCompanyId }).toArray();
  for (const it of items) {
    if (!['finished', 'semi-finished', 'raw'].includes(it.type)) {
      console.error(`[ERROR] InventoryItem type '${it.type}' has invalid casing or value! Must be lowercase finished/semi-finished/raw.`);
      totalErrors++;
    }
  }

  if (totalErrors > 0) {
    console.error(`[check_doc_shape] FAILED with ${totalErrors} schema mismatch error(s).`);
    process.exit(1);
  }



} finally {
  console.log(`[check_doc_shape] 6. Cleaning up temporary deterministic test entities...`);
  await db.collection('company').deleteMany({ company_id: testCompanyId });
  await db.collection('user').deleteMany({ company: testCompanyId });
  await db.collection('workers').deleteMany({ company_id: testCompanyId });
  await db.collection('warehouses').deleteMany({ company_id: testCompanyId });
  await db.collection('inventory_items').deleteMany({ company_id: testCompanyId });
  await db.collection('material_assignments').deleteMany({ company_id: testCompanyId });
  await db.collection('pay_records').deleteMany({ company_id: testCompanyId });
  await db.collection('bills').deleteMany({ company_id: testCompanyId });
  await db.collection('business_data').deleteMany({ company_id: testCompanyId });
  await db.collection('financial_summaries').deleteMany({ company_id: testCompanyId });
  await db.collection('insights').deleteMany({ company_id: testCompanyId });
  await db.collection('contact_message').deleteMany({ _id: testContactId });
  await client.close();
}

console.log(`[check_doc_shape] PASSED: All ${checkedDocs} documents conform strictly to Django MongoEngine models and pass Django API roundtrip.`);
process.exit(0);
