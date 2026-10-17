/**
 * Pure TypeScript Test Database Seeder
 * Equivalent to scripts/seed_test_db.py with identical deterministic fixtures.
 * Run with: pnpm dlx tsx scripts/seed.ts
 */
import { MongoClient, ObjectId } from '../apps/api/node_modules/mongodb/lib/index.js';
import { hashPassword } from '../apps/api/src/utils/crypto.js';

const dbName = process.env.MONGODB_DB_NAME || 'InsightLoop_test';
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/InsightLoop_test';

// Strict safety guards
if (!dbName.endsWith('_test')) {
  throw new Error(`ABORTING: Refusing to seed non-test database: ${dbName}. DB name MUST end in '_test'.`);
}
if (!uri.includes('localhost') && !uri.includes('127.0.0.1')) {
  throw new Error(`ABORTING: Refusing to seed non-local database host: ${uri}. Host MUST be local.`);
}

const ANCHOR_NOW = new Date('2026-10-14T21:00:00.000Z');
function daysAgo(n: number): Date {
  return new Date(ANCHOR_NOW.getTime() - n * 86400000);
}
function daysFuture(n: number): Date {
  return new Date(ANCHOR_NOW.getTime() + n * 86400000);
}

function djangoIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export async function seed(targetUri = uri, targetDbName = dbName) {
  console.log(`[SEED-TS] Seeding database: ${targetDbName} at ${targetUri}`);
  const client = new MongoClient(targetUri);
  await client.connect();
  const db = client.db(targetDbName);

  // 1. Clean test collections
  const collections = [
    'material_assignments',
    'pay_records',
    'workers',
    'business_data',
    'bills',
    'inventory_items',
    'warehouses',
    'insights',
    'financial_summaries',
    'contact_messages',
    'user',
    'company',
  ];
  for (const c of collections) {
    try {
      await db.collection(c).deleteMany({});
    } catch {}
  }

  // 2. Company A (Main Tenant)
  const compAOid = new ObjectId('670d8a000000000000000001');
  const compAUuid = 'company-a-uuid-0000-000000000001';
  await db.collection('company').insertOne({
    _id: compAOid,
    company_id: compAUuid,
    name: 'Company A Corp',
    business_type: 'Manufacturing',
    email: 'company_a@insightloop.dev',
    address: '100 Test St, City A',
    phone: '9876543210',
    gst_number: '27AAAAA0000A1Z5',
    bank_name: 'Test Bank A',
    ifsc_code: 'TB0001',
    bank_account_number: '1234567890',
    branch_name: 'Branch A',
    workspace_settings: {
      realtime_dashboard_refresh: true,
      jwt_session_authentication: true,
      ai_assistant_enabled: true,
      inventory_workspace_mode: true,
    },
    created_at: daysAgo(365),
    updated_at: daysAgo(365),
  });

  const passwordHash = await hashPassword('password123');

  const userAOid = new ObjectId('670d8a000000000000000002');
  await db.collection('user').insertOne({
    _id: userAOid,
    company: compAOid,
    name: 'Alice Admin',
    email: 'alice@company-a.com',
    username: 'alice',
    phone: '9876543210',
    location: 'City A',
    subscription: 'Pro Plan (₹499/mo)',
    notifications: { comments: true, weekly_summary: true, updates: true },
    password: passwordHash,
    created_at: daysAgo(365),
  });

  // 3. Company B (Secondary Tenant)
  const compBOid = new ObjectId('670d8a000000000000000003');
  const compBUuid = 'company-b-uuid-0000-000000000002';
  await db.collection('company').insertOne({
    _id: compBOid,
    company_id: compBUuid,
    name: 'Company B Ltd',
    business_type: 'Retail',
    email: 'company_b@insightloop.dev',
    address: '200 Other St, City B',
    phone: '9123456780',
    gst_number: '27BBBBB0000B1Z5',
    workspace_settings: {
      realtime_dashboard_refresh: true,
      jwt_session_authentication: true,
      ai_assistant_enabled: true,
      inventory_workspace_mode: true,
    },
    created_at: daysAgo(300),
    updated_at: daysAgo(300),
  });

  const userBOid = new ObjectId('670d8a000000000000000004');
  await db.collection('user').insertOne({
    _id: userBOid,
    company: compBOid,
    name: 'Bob Admin',
    email: 'bob@company-b.com',
    username: 'bob',
    phone: '9123456780',
    location: 'City B',
    subscription: 'Pro Plan (₹499/mo)',
    notifications: { comments: true, weekly_summary: false, updates: true },
    password: passwordHash,
    created_at: daysAgo(300),
  });

  // 4. Warehouses for Company A
  const whA1Oid = new ObjectId('670d8a000000000000000010');
  const whA2Oid = new ObjectId('670d8a000000000000000011');
  await db.collection('warehouses').insertMany([
    {
      _id: whA1Oid,
      company_id: compAUuid,
      name: 'Central Warehouse',
      location: 'City A',
      created_at: daysAgo(200),
    },
    {
      _id: whA2Oid,
      company_id: compAUuid,
      name: 'South Depot',
      location: 'City A South',
      created_at: daysAgo(200),
    },
  ]);

  // Warehouse for Company B
  const whB1Oid = new ObjectId('670d8a000000000000000012');
  await db.collection('warehouses').insertOne({
    _id: whB1Oid,
    company_id: compBUuid,
    name: 'Warehouse B',
    location: 'City B',
    created_at: daysAgo(200),
  });

  // 5. Inventory Items for Company A
  const itemFinishedOid = new ObjectId('670d8a000000000000000020');
  const itemSemiOid = new ObjectId('670d8a000000000000000021');
  const itemRawOid = new ObjectId('670d8a000000000000000022');
  await db.collection('inventory_items').insertMany([
    {
      _id: itemFinishedOid,
      company_id: compAUuid,
      name: 'Finished Desk',
      unit: 'pcs',
      type: 'finished',
      selling_price: 5000.0,
      cost_price: 3000.0,
      quantity: 50.0,
      reorder_level: 10.0,
      warehouse_id: whA1Oid.toString(),
      sku: 'SKU-00001',
      created_at: daysAgo(190),
      updated_at: daysAgo(190),
    },
    {
      _id: itemSemiOid,
      company_id: compAUuid,
      name: 'Desk Frame',
      unit: 'pcs',
      type: 'semi_finished',
      selling_price: 2000.0,
      cost_price: 1200.0,
      quantity: 30.0,
      reorder_level: 5.0,
      warehouse_id: whA1Oid.toString(),
      sku: 'SKU-00002',
      created_at: daysAgo(190),
      updated_at: daysAgo(190),
    },
    {
      _id: itemRawOid,
      company_id: compAUuid,
      name: 'Oak Timber',
      unit: 'kg',
      type: 'raw',
      selling_price: 500.0,
      cost_price: 300.0,
      quantity: 200.0,
      reorder_level: 20.0,
      warehouse_id: whA2Oid.toString(),
      sku: 'SKU-00003',
      created_at: daysAgo(190),
      updated_at: daysAgo(190),
    },
  ]);

  // Inventory Item for Company B
  const itemBOid = new ObjectId('670d8a000000000000000023');
  await db.collection('inventory_items').insertOne({
    _id: itemBOid,
    company_id: compBUuid,
    name: 'Item B Private',
    unit: 'pcs',
    type: 'finished',
    selling_price: 100.0,
    cost_price: 50.0,
    quantity: 10.0,
    sku: 'SKU-00001',
    created_at: daysAgo(190),
    updated_at: daysAgo(190),
  });

  // 6. Workers for Company A
  const worker1Oid = new ObjectId('670d8a000000000000000030');
  await db.collection('workers').insertOne({
    _id: worker1Oid,
    company_id: compAUuid,
    name: 'Ramesh Carpenter',
    age: 35,
    address: 'Woodland St',
    phone: '9988776655',
    joining_date: daysAgo(180),
    is_active: true,
    created_at: daysAgo(180),
    updated_at: daysAgo(180),
  });

  // Worker for Company B
  const workerBOid = new ObjectId('670d8a000000000000000031');
  await db.collection('workers').insertOne({
    _id: workerBOid,
    company_id: compBUuid,
    name: 'Worker B Private',
    age: 40,
    joining_date: daysAgo(100),
    is_active: true,
    created_at: daysAgo(100),
    updated_at: daysAgo(100),
  });

  // 7. Material Assignment for Worker 1
  const assignment1Oid = new ObjectId('670d8a000000000000000040');
  await db.collection('material_assignments').insertOne({
    _id: assignment1Oid,
    company_id: compAUuid,
    worker: worker1Oid,
    material_name: 'Desk Assembly',
    quantity: 20,
    price_per_unit: 50.0,
    assignment_date: daysAgo(10),
    notes: 'Urgent consignment',
    batches: [
      {
        quantity: 10,
        date: djangoIso(daysAgo(5)),
        notes: 'First chunk',
      },
    ],
    status: 'open',
    wage_amount: 500.0,
    created_at: daysAgo(10),
    updated_at: daysAgo(10),
  });

  // 7b. Pay Record for Worker 1
  const payRecord1Oid = new ObjectId('670d8a000000000000000070');
  await db.collection('pay_records').insertOne({
    _id: payRecord1Oid,
    company_id: compAUuid,
    worker: worker1Oid,
    product_name: 'Desk Assembly',
    units_produced: 1,
    rate_per_unit: 500.0,
    amount_paid: 500.0,
    paid: true,
    date: daysAgo(5),
    source_assignment_id: assignment1Oid.toString(),
  });

  // 8. Bills for Company A
  const billKachaOid = new ObjectId('670d8a000000000000000050');
  await db.collection('bills').insertOne({
    _id: billKachaOid,
    company_id: compAUuid,
    bill_type: 'kacha',
    buyer: { name: 'Kacha Buyer', address: 'Market Rd', phone: '9811223344' },
    products: [
      {
        name: 'Finished Desk',
        description: 'Standard',
        quantity: 2.0,
        rate: 5000.0,
        unit: 'pcs',
        total: 10000.0,
        inventory_item_id: itemFinishedOid.toString(),
      },
    ],
    subtotal: 10000.0,
    gst_percentage: 0.0,
    gst_amount: 0.0,
    discount: 500.0,
    grand_total: 9500.0,
    invoice_number: 'INV-2026-00001',
    payments: [{ amount: 5000.0, date: djangoIso(daysAgo(2)), notes: 'Advance' }],
    profit_confirmed: false,
    created_at: daysAgo(2),
    updated_at: daysAgo(2),
  });

  const billPakkaOid = new ObjectId('670d8a000000000000000051');
  await db.collection('bills').insertOne({
    _id: billPakkaOid,
    company_id: compAUuid,
    bill_type: 'pakka',
    buyer: {
      name: 'Pakka Buyer Ltd',
      address: 'Corporate Park',
      gst_number: '27AAAAA1234A1Z1',
      phone: '9822334455',
    },
    products: [
      {
        name: 'Finished Desk',
        description: 'Premium',
        quantity: 5.0,
        rate: 6000.0,
        unit: 'pcs',
        total: 30000.0,
        inventory_item_id: itemFinishedOid.toString(),
      },
    ],
    subtotal: 30000.0,
    gst_percentage: 18.0,
    gst_amount: 5400.0,
    discount: 0.0,
    grand_total: 35400.0,
    invoice_number: 'INV-2026-00002',
    payments: [{ amount: 35400.0, date: djangoIso(daysAgo(1)), notes: 'Full payment' }],
    profit_confirmed: true,
    profit_suggested_amount: 15000.0,
    profit_confirmed_amount: 15000.0,
    profit_confirmed_at: daysAgo(1),
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  });

  // 9. BusinessData (Historical Sales) for Company A
  const bizDocs = [];
  for (let i = 1; i < 30; i++) {
    bizDocs.push({
      company_id: compAUuid,
      date: daysAgo(i * 2),
      product: 'Finished Desk',
      category: 'Furniture',
      quantity: 5,
      production_cost: 3000.0,
      selling_price: 5000.0,
      region: 'North',
      customer_type: 'Wholesale',
    });
  }
  await db.collection('business_data').insertMany(bizDocs);

  // 10. Insight for Company A
  const insightOid = new ObjectId('670d8a000000000000000060');
  await db.collection('insights').insertOne({
    _id: insightOid,
    company_id: compAUuid,
    title: 'Sales Spike Detected',
    description: 'High volume sales in North region',
    labels: ['09/01', '09/02', '09/03'],
    data_points: [10000.0, 25000.0, 30000.0],
    note: 'Q3 review',
    created_at: daysAgo(5),
    expires_at: daysFuture(25),
  });

  console.log('[SEED-TS] Test database seeded successfully with deterministic fixtures.');
  await client.close();
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed().catch((err) => {
    console.error('[SEED-TS] Fatal error:', err);
    process.exit(1);
  });
}
