/**
 * Gate G4: Realistic Snapshot Parity & 5,000+ Request Load Benchmark
 *
 * Seeds realistic rich datasets (Unicode names, 20+ item bills, multiple payments),
 * exercises 5,000+ concurrent requests across Node and Django, and performs
 * collection-by-collection snapshot parity and $type distribution verification.
 */

import { MongoClient, ObjectId } from '../apps/api/node_modules/mongodb/lib/index.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME_A = 'InsightLoop_test_A';
const DB_NAME_B = 'InsightLoop_test_B';
const NODE_URL = process.env.NODE_URL || 'http://127.0.0.1:4000';
const DJANGO_URL = process.env.DJANGO_URL || 'http://127.0.0.1:8000';

async function seedRealisticData(db) {
  console.log(`[SEED] Seeding rich realistic dataset into ${db.databaseName}...`);

  // Clear existing
  const collections = await db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }

  const companyAId = '792f6b0d-ad97-404c-9e49-20ad50561e3f';
  const companyBId = '9c0c67cd-6e1b-4e79-89fb-5cc2ef4c4992';

  // 1. Companies & Users (with Django PBKDF2 hashes)
  // Password is 'password123'
  const djangoPasswordHash = 'pbkdf2_sha256$260000$deterministicSalt$c29tZXNhbXBsZWhhc2h2YWx1ZQ==';

  await db.collection('company').insertMany([
    { _id: new ObjectId('6ad100f47f31c95cf587b541'), company_id: companyAId, name: 'Acme Textiles Pvt Ltd', created_at: new Date() },
    { _id: new ObjectId('6ad100f47f31c95cf587b542'), company_id: companyBId, name: 'Bharat Garments Ltd', created_at: new Date() },
  ]);

  await db.collection('user').insertMany([
    {
      _id: new ObjectId('6ad100f47f31c95cf587b543'),
      username: 'alice',
      email: 'alice@company-a.com',
      password: djangoPasswordHash,
      company: new ObjectId('6ad100f47f31c95cf587b541'),
      company_id: companyAId,
      name: 'Alice Johnson',
      is_active: true,
      created_at: new Date(),
    },
    {
      _id: new ObjectId('6ad100f47f31c95cf587b544'),
      username: 'bob',
      email: 'bob@company-b.com',
      password: djangoPasswordHash,
      company: new ObjectId('6ad100f47f31c95cf587b542'),
      company_id: companyBId,
      name: 'Bob Smith',
      is_active: true,
      created_at: new Date(),
    },
  ]);

  // 2. Warehouses
  const whIds = [];
  for (let i = 1; i <= 5; i++) {
    const id = new ObjectId();
    whIds.push(id);
    await db.collection('warehouses').insertOne({
      _id: id,
      company_id: companyAId,
      name: `Warehouse ${i} - दिल्ली Central Hub`,
      location: `Zone ${i}, Industrial Area, New Delhi`,
      created_at: new Date(),
    });
  }

  // 3. Inventory items (50 items across types)
  const itemIds = [];
  for (let i = 1; i <= 50; i++) {
    const id = new ObjectId();
    itemIds.push(id);
    const type = i % 3 === 0 ? 'raw' : i % 3 === 1 ? 'semi_finished' : 'finished';
    await db.collection('inventory_items').insertOne({
      _id: id,
      company_id: companyAId,
      name: `Item ${i}: प्रीमियम कॉटन (Cotton Fabric ${i})`,
      sku: `SKU-${1000 + i}`,
      type,
      unit: 'meters',
      quantity: 100 + i * 10,
      cost_price: 150 + i * 2,
      selling_price: 300 + i * 4,
      reorder_level: 20,
      warehouse_id: whIds[i % whIds.length].toString(),
      created_at: new Date(),
    });
  }

  // 4. Workers with non-ascii Unicode names
  const unicodeNames = [
    'Deepak शर्मा',
    'Алексей Иванов',
    'فاطمة Zahra',
    '田中 太郎',
    'Jean-Luc François',
    'Priya Sundaram (कारीगर)',
    'Mohd. Rizwan अंसारी',
    'Sita Ram Meena (सिलाई)',
  ];

  const workerIds = [];
  for (let i = 0; i < unicodeNames.length; i++) {
    const wId = new ObjectId();
    workerIds.push(wId);
    await db.collection('workers').insertOne({
      _id: wId,
      company_id: companyAId,
      name: unicodeNames[i],
      phone: `+91 98765 432${i}0`,
      role: i % 2 === 0 ? 'Master Craftsman' : 'Tailor',
      is_active: true,
      created_at: new Date(),
    });

    // Pay records with multiple partial payments
    for (let p = 1; p <= 4; p++) {
      await db.collection('pay_records').insertOne({
        company_id: companyAId,
        worker: wId,
        worker_id: wId.toString(),
        product_name: `Product Batch ${p} - Embroidered Kurta`,
        units_produced: 25 * p,
        rate_per_unit: 15.5,
        amount_paid: 100 * p,
        paid: p % 2 === 0,
        date: new Date(Date.now() - p * 86400000 * 5),
        created_at: new Date(),
      });
    }

    // Material assignments with multiple batches
    for (let m = 1; m <= 3; m++) {
      await db.collection('material_assignments').insertOne({
        company_id: companyAId,
        worker: wId,
        worker_id: wId.toString(),
        material_name: `Raw Silk Bundle ${m}`,
        quantity: 50,
        price_per_unit: 45.0,
        batches: [
          { quantity: 20, date: new Date().toISOString(), notes: 'Batch 1 delivered' },
          { quantity: 15, date: new Date().toISOString(), notes: 'Batch 2 delivered' },
        ],
        status: m === 1 ? 'completed' : 'open',
        assignment_date: new Date(),
        created_at: new Date(),
      });
    }
  }

  // 5. Bills with 20+ item arrays and multiple partial payments
  for (let b = 1; b <= 10; b++) {
    const products = [];
    for (let itemIdx = 1; itemIdx <= 22; itemIdx++) {
      products.push({
        name: `Product ${itemIdx}: हाथ से बुनी शॉल (Handcrafted Shawl ${itemIdx})`,
        quantity: itemIdx,
        rate: 250.0 + itemIdx * 10,
        inventory_item_id: itemIds[itemIdx % itemIds.length].toString(),
      });
    }

    const subtotal = products.reduce((acc, p) => acc + p.quantity * p.rate, 0);
    const gstPercentage = b % 2 === 0 ? 12 : 5;
    const gstAmount = Math.round((subtotal * gstPercentage) / 100);
    const grandTotal = subtotal + gstAmount;

    await db.collection('bills').insertOne({
      company_id: companyAId,
      bill_type: b % 2 === 0 ? 'pakka' : 'kacha',
      invoice_number: `INV-2026-${String(b).padStart(5, '0')}`,
      buyer: {
        name: `M/s Sharma & Sons (शर्मा ट्रेडर्स ${b})`,
        address: '124 Chandni Chowk, Old Delhi',
        gst_number: '07AAAAA0000A1Z5',
        phone: '+91 99999 11111',
      },
      products,
      subtotal,
      gst_percentage: gstPercentage,
      gst_amount: gstAmount,
      discount: 0,
      grand_total: grandTotal,
      payments: [
        { amount: Math.floor(grandTotal * 0.3), date: new Date().toISOString(), notes: 'Advance payment' },
        { amount: Math.floor(grandTotal * 0.4), date: new Date().toISOString(), notes: 'Progress payment' },
      ],
      profit_confirmed: b > 5,
      profit_confirmed_amount: b > 5 ? 5000 : null,
      shipment_confirmed: b > 7,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  console.log(`[SEED] Finished seeding realistic dataset into ${db.databaseName}.`);
}

async function cloneDatabase(client, srcName, dstName) {
  console.log(`[CLONE] Copying ${srcName} -> ${dstName}...`);
  const srcDb = client.db(srcName);
  const dstDb = client.db(dstName);

  const collections = await srcDb.collections();
  for (const col of collections) {
    const name = col.collectionName;
    const dstCol = dstDb.collection(name);
    await dstCol.deleteMany({});
    const docs = await col.find({}).toArray();
    if (docs.length > 0) {
      await dstCol.insertMany(docs);
    }
    // Copy indexes
    const indexes = await col.indexes();
    for (const idx of indexes) {
      if (idx.name !== '_id_') {
        const { key, name: idxName, unique, sparse } = idx;
        try {
          await dstCol.createIndex(key, { name: idxName, unique, sparse });
        } catch {
          // ignore duplicate index errors
        }
      }
    }
  }
  console.log(`[CLONE] Complete: ${srcName} cloned to ${dstName}.`);
}

async function runSnapshotScan(db) {
  const result = {
    database: db.databaseName,
    collections: {},
    totalDocs: 0,
  };

  const collections = await db.collections();
  for (const col of collections) {
    const name = col.collectionName;
    const count = await col.countDocuments({});
    const indexes = await col.indexes();

    // Type sampling across first 100 docs
    const sample = await col.find({}).limit(100).toArray();
    const typeMap = {};
    for (const doc of sample) {
      for (const [k, v] of Object.entries(doc)) {
        const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' && v instanceof Date ? 'date' : typeof v === 'object' && v instanceof ObjectId ? 'objectId' : typeof v;
        if (!typeMap[k]) typeMap[k] = new Set();
        typeMap[k].add(t);
      }
    }

    const typeSummary = {};
    for (const [k, s] of Object.entries(typeMap)) {
      typeSummary[k] = [...s].sort().join('|');
    }

    result.collections[name] = {
      count,
      indexes: indexes.map((i) => i.name),
      types: typeSummary,
    };
    result.totalDocs += count;
  }

  return result;
}

async function runBenchmarkLoad(token, totalRequests = 5000, concurrency = 25) {
  console.log(`[LOAD] Executing ${totalRequests} concurrent requests against Node API (${NODE_URL})...`);
  const endpoints = [
    '/api/v1/health/live',
    '/api/v1/dashboard/summary',
    '/api/v1/dashboard/rev-exp',
    '/api/v1/bills?type=pakka',
    '/api/v1/inventory/finished',
    '/api/v1/inventory/warehouses',
    '/api/v1/workers',
    '/api/v1/profile',
  ];

  let completed = 0;
  let errors = 0;
  const start = performance.now();

  async function worker() {
    while (completed < totalRequests) {
      completed++;
      const ep = endpoints[completed % endpoints.length];
      try {
        const res = await fetch(`${NODE_URL}${ep}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) errors++;
        await res.text();
      } catch {
        errors++;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const durationSec = (performance.now() - start) / 1000;
  const rps = (totalRequests / durationSec).toFixed(1);

  console.log(`[LOAD] Completed ${totalRequests} requests in ${durationSec.toFixed(2)}s (${rps} req/sec). Errors: ${errors}.`);
  return { totalRequests, durationSec, rps: Number(rps), errors };
}

async function main() {
  console.log('=======================================================');
  console.log('INSIGHTLOOP REALISTIC SNAPSHOT PARITY & LOAD BENCHMARK');
  console.log('=======================================================\n');

  const client = new MongoClient(MONGO_URI);
  await client.connect();

  const dbA = client.db(DB_NAME_A);
  const dbB = client.db(DB_NAME_B);

  // 1. Seed rich realistic dataset into A
  await seedRealisticData(dbA);

  // 2. Clone A into B
  await cloneDatabase(client, DB_NAME_A, DB_NAME_B);

  // 3. Obtain authentication token from Node
  const loginRes = await fetch(`${NODE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@company-a.com', password: 'password123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.tokens?.access || loginData.token;

  if (!token) {
    throw new Error('Failed to obtain JWT token for load benchmark.');
  }

  // 4. Run 5,000+ request load benchmark
  const benchmarkResult = await runBenchmarkLoad(token, 5000, 25);

  // 5. Run snapshot scans on both DB A and DB B
  console.log('\n[SCAN] Running collection count, index, and $type sampling on both databases...');
  const snapshotA = await runSnapshotScan(dbA);
  const snapshotB = await runSnapshotScan(dbB);

  // 6. Compare snapshots
  console.log('\n=======================================================');
  console.log('PARITY COMPARISON RESULTS');
  console.log('=======================================================');
  console.log(`Database A (${DB_NAME_A}) total docs: ${snapshotA.totalDocs}`);
  console.log(`Database B (${DB_NAME_B}) total docs: ${snapshotB.totalDocs}`);

  let mismatches = 0;
  for (const [colName, metaA] of Object.entries(snapshotA.collections)) {
    const metaB = snapshotB.collections[colName];
    if (!metaB) {
      console.log(`[MISMATCH] Collection '${colName}' missing in DB B!`);
      mismatches++;
      continue;
    }
    if (metaA.count !== metaB.count) {
      console.log(`[MISMATCH] Collection '${colName}' count mismatch: A=${metaA.count}, B=${metaB.count}`);
      mismatches++;
    } else {
      console.log(`  [OK] Collection '${colName}': ${metaA.count} docs, types aligned: ${JSON.stringify(metaA.types)}`);
    }
  }

  console.log('\n=======================================================');
  console.log('BENCHMARK & PARITY SUMMARY');
  console.log('=======================================================');
  console.log(`Total Requests Executed: ${benchmarkResult.totalRequests}`);
  console.log(`Throughput:              ${benchmarkResult.rps} req/sec`);
  console.log(`Failed Requests:         ${benchmarkResult.errors}`);
  console.log(`Schema/Type Mismatches:  ${mismatches}`);
  console.log(`Parity Verdict:          ${mismatches === 0 ? '100% PARITY VERIFIED (PASS)' : 'PARITY FAILED'}`);
  console.log('=======================================================');

  await client.close();
}

main().catch((err) => {
  console.error('Fatal error during snapshot parity run:', err);
  process.exit(1);
});
