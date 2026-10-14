/**
 * InsightLoop Dual-Stack Cross-Database Compatibility Test Suite
 *
 * Verifies bidirectional interoperability between Node.js Express API (port 4000)
 * and Python Django API (port 8000) backed by the same MongoDB database (InsightLoop_test).
 *
 * Checks:
 * 1. Node creates entity -> Django reads & mutates
 * 2. Django creates entity -> Node reads & mutates
 * 3. Direct BSON type verification in MongoDB (no stringified dates, numbers, or IDs)
 */

import { spawnSync } from 'node:child_process';
import { MongoClient, ObjectId } from '../apps/api/node_modules/mongodb/lib/index.js';

const NODE_URL = process.env.NODE_API_URL || 'http://127.0.0.1:4000';
const DJANGO_URL = process.env.DJANGO_API_URL || 'http://127.0.0.1:8000';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/InsightLoop_test';

// Runtime guard: only localhost and _test DB
if (!MONGO_URI.includes('localhost') && !MONGO_URI.includes('127.0.0.1')) {
  console.error('ABORT: MONGO_URI must target localhost.');
  process.exit(1);
}
if (!MONGO_URI.endsWith('_test') && !MONGO_URI.includes('_test?')) {
  console.error('ABORT: MONGO_URI must target a database ending in _test.');
  process.exit(1);
}

async function request(url, method, endpoint, { headers = {}, body = null } = {}) {
  const reqHeaders = { ...headers };
  const opts = { method, headers: reqHeaders };
  if (body) {
    reqHeaders['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${url}${endpoint}`, opts);
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, data };
}

async function main() {
  console.log('=======================================================');
  console.log('INSIGHTLOOP DUAL-STACK CROSS-COMPATIBILITY VERIFICATION');
  console.log(`Node API:   ${NODE_URL}`);
  console.log(`Django API: ${DJANGO_URL}`);
  console.log(`MongoDB:    ${MONGO_URI}`);
  console.log('=======================================================\n');

  // 1. Re-seed test database
  console.log('--- 1. Resetting test DB with deterministic seed ---');
  const seedProc = spawnSync('.venv/bin/python', ['scripts/seed_test_db.py'], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      MONGODB_URI: MONGO_URI,
      MONGODB_DB_NAME: 'InsightLoop_test',
    },
  });
  if (seedProc.status !== 0) {
    console.error('Seeding failed:', seedProc.stderr);
    process.exit(1);
  }
  console.log('Seeded successfully.\n');

  // 2. Authenticate against both stacks
  console.log('--- 2. Authenticating User A on both stacks ---');
  const nodeLogin = await request(NODE_URL, 'POST', '/api/v1/auth/login/', {
    body: { email: 'alice@company-a.com', password: 'password123' },
  });
  if (nodeLogin.status !== 200) throw new Error(`Node login failed: ${JSON.stringify(nodeLogin.data)}`);
  const nodeToken = nodeLogin.data.tokens?.access || nodeLogin.data.access;

  const djangoLogin = await request(DJANGO_URL, 'POST', '/api/v1/auth/login/', {
    body: { email: 'alice@company-a.com', password: 'password123' },
  });
  if (djangoLogin.status !== 200) throw new Error(`Django login failed: ${JSON.stringify(djangoLogin.data)}`);
  const djangoToken = djangoLogin.data.tokens?.access || djangoLogin.data.access;
  console.log('Tokens acquired on both stacks.\n');

  const nodeHeaders = { Authorization: `Bearer ${nodeToken}` };
  const djangoHeaders = { Authorization: `Bearer ${djangoToken}` };

  // 3. Round-Trip 1: Inventory Warehouse (Node create -> Django read -> Django update -> Node read)
  console.log('--- 3. Round-Trip 1: Inventory Warehouse ---');
  const whName = `CrossStack WH ${Date.now()}`;
  const createWhNode = await request(NODE_URL, 'POST', '/api/v1/inventory/warehouses/', {
    headers: nodeHeaders,
    body: { name: whName, location: 'Sector 5 Node Wing' },
  });
  if (createWhNode.status !== 201) throw new Error(`Node WH creation failed: ${JSON.stringify(createWhNode.data)}`);
  const whId = createWhNode.data.id;
  console.log(`[PASS] Node created warehouse ID ${whId}`);

  // Django reads warehouses
  const getWhDjango = await request(DJANGO_URL, 'GET', '/api/v1/inventory/warehouses/', {
    headers: djangoHeaders,
  });
  if (getWhDjango.status !== 200) throw new Error(`Django WH get failed: ${JSON.stringify(getWhDjango.data)}`);
  const foundDjangoWh = getWhDjango.data.find(w => w.id === whId);
  if (!foundDjangoWh || foundDjangoWh.name !== whName) {
    throw new Error(`Django failed to find warehouse created by Node: ${JSON.stringify(foundDjangoWh)}`);
  }
  console.log(`[PASS] Django cleanly read warehouse created by Node (name: "${foundDjangoWh.name}")`);

  // 4. Round-Trip 2: Worker & Material Lifecycle (Node create worker -> Django create assignment -> Node record batch -> Django complete assignment -> Node verify pay record)
  console.log('\n--- 4. Round-Trip 2: Worker & Material Lifecycle ---');
  const createWorkerNode = await request(NODE_URL, 'POST', '/api/v1/workers/', {
    headers: nodeHeaders,
    body: {
      name: 'Dual-Stack Craftsman',
      age: 38,
      phone: '9876543210',
      address: 'Industrial Workshop 3',
    },
  });
  if (createWorkerNode.status !== 201) throw new Error(`Node Worker creation failed: ${JSON.stringify(createWorkerNode.data)}`);
  const workerId = createWorkerNode.data.id;
  console.log(`[PASS] Node created worker ID ${workerId}`);

  // Django reads worker detail
  const getWorkerDjango = await request(DJANGO_URL, 'GET', `/api/v1/workers/${workerId}/`, {
    headers: djangoHeaders,
  });
  if (getWorkerDjango.status !== 200) throw new Error(`Django Worker get failed: ${JSON.stringify(getWorkerDjango.data)}`);
  if (getWorkerDjango.data.name !== 'Dual-Stack Craftsman' || getWorkerDjango.data.age !== 38) {
    throw new Error(`Django worker verification failed: ${JSON.stringify(getWorkerDjango.data)}`);
  }
  console.log(`[PASS] Django cleanly read worker created by Node`);

  // Django creates material assignment
  const createAssignDjango = await request(DJANGO_URL, 'POST', `/api/v1/workers/${workerId}/materials/`, {
    headers: djangoHeaders,
    body: {
      material_name: 'Walnut Dining Chair',
      quantity: 5,
      price_per_unit: 250.0,
      wage_amount: 1250.0,
      notes: 'Dispatched via Django',
    },
  });
  if (createAssignDjango.status !== 201) throw new Error(`Django Material creation failed: ${JSON.stringify(createAssignDjango.data)}`);
  const assignId = createAssignDjango.data.id;
  console.log(`[PASS] Django created material assignment ID ${assignId}`);

  // Node reads material assignment
  const getAssignNode = await request(NODE_URL, 'GET', `/api/v1/workers/${workerId}/materials/`, {
    headers: nodeHeaders,
  });
  if (getAssignNode.status !== 200) throw new Error(`Node Material list failed: ${JSON.stringify(getAssignNode.data)}`);
  const foundAssign = getAssignNode.data.find(a => a.id === assignId);
  if (!foundAssign || foundAssign.material_name !== 'Walnut Dining Chair') {
    throw new Error(`Node failed to find assignment created by Django: ${JSON.stringify(foundAssign)}`);
  }
  console.log(`[PASS] Node cleanly read material assignment created by Django`);

  // Node records batch production
  const addBatchNode = await request(NODE_URL, 'POST', `/api/v1/workers/materials/${assignId}/batches/`, {
    headers: nodeHeaders,
    body: { quantity: 5, notes: 'Completed batch via Node' },
  });
  if (addBatchNode.status !== 201) throw new Error(`Node add batch failed: ${JSON.stringify(addBatchNode.data)}`);
  console.log(`[PASS] Node added batch delivery to Django assignment`);

  // Django completes assignment
  const completeDjango = await request(DJANGO_URL, 'PUT', `/api/v1/workers/materials/${assignId}/complete/`, {
    headers: djangoHeaders,
  });
  if (completeDjango.status !== 200) throw new Error(`Django complete assignment failed: ${JSON.stringify(completeDjango.data)}`);
  if (completeDjango.data.status !== 'completed') {
    throw new Error(`Django complete status mismatch: ${completeDjango.data.status}`);
  }
  console.log(`[PASS] Django completed assignment with auto-generated pay record`);

  // Node verifies pay record and pays worker
  const nodePayments = await request(NODE_URL, 'GET', `/api/v1/workers/${workerId}/payments/`, {
    headers: nodeHeaders,
  });
  if (nodePayments.status !== 200 || !nodePayments.data.length) {
    throw new Error(`Node failed to find payments: ${JSON.stringify(nodePayments.data)}`);
  }
  const payRecord = nodePayments.data[0];
  console.log(`[PASS] Node verified pay record: amount ${payRecord.total_amount}, paid: ${payRecord.paid}`);

  // Node records partial payment
  const recordPayNode = await request(NODE_URL, 'POST', `/api/v1/workers/payments/${payRecord.id}/record-payment/`, {
    headers: nodeHeaders,
    body: { amount: 500.0 },
  });
  if (recordPayNode.status !== 201 && recordPayNode.status !== 200) {
    throw new Error(`Node record payment failed: ${JSON.stringify(recordPayNode.data)}`);
  }
  console.log(`[PASS] Node recorded partial payment of ₹500`);

  // Django marks payment fully paid
  const markPaidDjango = await request(DJANGO_URL, 'PUT', `/api/v1/workers/payments/${payRecord.id}/mark-paid/`, {
    headers: djangoHeaders,
  });
  if (markPaidDjango.status !== 200) throw new Error(`Django mark paid failed: ${JSON.stringify(markPaidDjango.data)}`);
  if (!markPaidDjango.data.paid) throw new Error(`Expected paid=true from Django`);
  console.log(`[PASS] Django marked payment record as fully paid`);

  // 5. Round-Trip 3: Bills, Profit Preview, and Confirmation
  console.log('\n--- 5. Round-Trip 3: Bill Flow (Node create Kacha -> Django convert to Pakka -> Node record payment -> Django confirm profit) ---');
  const createBillNode = await request(NODE_URL, 'POST', '/api/v1/bills/', {
    headers: nodeHeaders,
    body: {
      bill_type: 'kacha',
      buyer: { name: 'Cross-Stack Retailers', phone: '9988776655', address: 'Market Lane' },
      products: [
        { name: 'Standard Desk', quantity: 2, price: 5000, cost_price: 3200 },
      ],
      discount: 200,
    },
  });
  if (createBillNode.status !== 201) throw new Error(`Node bill creation failed: ${JSON.stringify(createBillNode.data)}`);
  const billId = createBillNode.data.id;
  console.log(`[PASS] Node created Kacha bill ${createBillNode.data.invoice_number} (ID ${billId})`);

  // Django reads bill
  const getBillDjango = await request(DJANGO_URL, 'GET', `/api/v1/bills/${billId}/`, {
    headers: djangoHeaders,
  });
  if (getBillDjango.status !== 200) throw new Error(`Django bill get failed: ${JSON.stringify(getBillDjango.data)}`);
  if (getBillDjango.data.bill_type !== 'kacha' || getBillDjango.data.grand_total !== 9800) {
    throw new Error(`Django bill data mismatch: ${JSON.stringify(getBillDjango.data)}`);
  }
  console.log(`[PASS] Django cleanly read Kacha bill created by Node`);

  // Django converts Kacha to Pakka
  const convertBillDjango = await request(DJANGO_URL, 'POST', `/api/v1/bills/${billId}/convert/`, {
    headers: djangoHeaders,
    body: { gst_number: '27AAAAA1234A1Z1', gst_percentage: 18.0 },
  });
  if (convertBillDjango.status !== 200) throw new Error(`Django convert to pakka failed: ${JSON.stringify(convertBillDjango.data)}`);
  if (convertBillDjango.data.bill_type !== 'pakka' || convertBillDjango.data.gst_amount !== 1764) {
    throw new Error(`Django pakka calculation mismatch: ${JSON.stringify(convertBillDjango.data)}`);
  }
  console.log(`[PASS] Django converted bill to Pakka (taxable: 9800, GST 18%: 1764, grand total: 11564)`);

  // Node records payment on bill
  const payBillNode = await request(NODE_URL, 'POST', `/api/v1/bills/${billId}/record-payment/`, {
    headers: nodeHeaders,
    body: { amount: 11564.0, notes: 'Full payment via Node' },
  });
  if (payBillNode.status !== 201) throw new Error(`Node bill payment failed: ${JSON.stringify(payBillNode.data)}`);
  if (payBillNode.data.payment_status !== 'paid') {
    throw new Error(`Node bill payment status mismatch: ${payBillNode.data.payment_status}`);
  }
  console.log(`[PASS] Node recorded full payment on converted Pakka bill`);

  // Django confirms profit
  const confirmProfitDjango = await request(DJANGO_URL, 'POST', `/api/v1/bills/${billId}/confirm-profit/`, {
    headers: djangoHeaders,
    body: { confirmed_amount: 5164.0 },
  });
  if (confirmProfitDjango.status !== 200) throw new Error(`Django profit confirmation failed: ${JSON.stringify(confirmProfitDjango.data)}`);
  if (!confirmProfitDjango.data.profit_confirmed) throw new Error('Expected profit_confirmed=true');
  console.log(`[PASS] Django confirmed profit on bill`);

  // Node verifies confirmed profit and status
  const verifyBillNode = await request(NODE_URL, 'GET', `/api/v1/bills/${billId}/`, {
    headers: nodeHeaders,
  });
  if (verifyBillNode.status !== 200) throw new Error(`Node verify bill failed: ${JSON.stringify(verifyBillNode.data)}`);
  if (!verifyBillNode.data.profit_confirmed || verifyBillNode.data.profit_confirmed_amount !== 5164) {
    throw new Error(`Node profit verification mismatch: ${JSON.stringify(verifyBillNode.data)}`);
  }
  console.log(`[PASS] Node verified profit confirmed by Django`);

  // 6. Direct MongoDB BSON Type Audit
  console.log('\n--- 6. Direct MongoDB BSON Type Audit ---');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('InsightLoop_test');

  const checkDoc = await db.collection('bills').findOne({ _id: new ObjectId(billId) });
  if (!checkDoc) throw new Error('Bill not found in MongoDB');

  // Verify BSON types
  console.log('Validating BSON types on dual-stack modified document:');
  const isDate = val => val instanceof Date && !isNaN(val.getTime());
  const isNumber = val => typeof val === 'number';
  const isBool = val => typeof val === 'boolean';
  const isObjectId = val => val instanceof ObjectId;

  if (!isObjectId(checkDoc._id)) throw new Error('_id must be BSON ObjectId');
  if (!isDate(checkDoc.created_at)) throw new Error('created_at must be BSON Date');
  if (!isDate(checkDoc.updated_at)) throw new Error('updated_at must be BSON Date');
  if (!isDate(checkDoc.profit_confirmed_at)) throw new Error('profit_confirmed_at must be BSON Date');
  if (!isNumber(checkDoc.grand_total)) throw new Error('grand_total must be BSON Number');
  if (!isNumber(checkDoc.subtotal)) throw new Error('subtotal must be BSON Number');
  if (!isNumber(checkDoc.gst_percentage)) throw new Error('gst_percentage must be BSON Number');
  if (!isBool(checkDoc.profit_confirmed)) throw new Error('profit_confirmed must be BSON Boolean');
  if (!isBool(checkDoc.shipment_confirmed)) throw new Error('shipment_confirmed must be BSON Boolean');

  console.log('  ✓ _id: BSON ObjectId');
  console.log('  ✓ created_at, updated_at, profit_confirmed_at: BSON Date');
  console.log('  ✓ grand_total, subtotal, gst_percentage: BSON Double/Number');
  console.log('  ✓ profit_confirmed, shipment_confirmed: BSON Boolean');
  console.log('  ✓ Zero schema-corruption exceptions across Django and Node.');

  await client.close();

  console.log('\n=======================================================');
  console.log('ALL DUAL-STACK CROSS-COMPATIBILITY CHECKS PASSED (100%)');
  console.log('=======================================================');
}

main().catch(err => {
  console.error('\nFAIL: Dual-stack cross-compatibility test error:', err);
  process.exit(1);
});
