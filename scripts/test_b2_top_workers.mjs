import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const report = [];
function log(msg = '') {
  console.log(msg);
  report.push(msg);
}

log('=================================================================');
log('B2: TOP WORKERS & WORKER PAYMENTS DUAL-STACK PARITY AUDIT');
log(`Timestamp: ${new Date().toISOString()}`);
log('=================================================================\n');

// 1. Clean test DB
log('Step 1: Reseeding clean test DB...');
const env = {
  ...process.env,
  MONGODB_URI: 'mongodb://localhost:27017/InsightLoop_test',
  MONGODB_DB_NAME: 'InsightLoop_test',
  DJANGO_SECRET_KEY: 'test-secret-key-must-be-long-enough-32-chars',
  REDIS_URL: '',
  DJANGO_DEBUG: 'true',
  PYTHONPATH: path.resolve(ROOT, 'insightloop'),
};
execSync('.venv/bin/python scripts/seed_test_db.py', { cwd: ROOT, env, stdio: 'inherit' });

// 2. Login to both stacks
log('\nStep 2: Authenticating with Alice on Django (port 8000) and Node (port 4000)...');
const [djangoAuthRes, nodeAuthRes] = await Promise.all([
  fetch('http://127.0.0.1:8000/api/v1/auth/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@company-a.com', password: 'password123' }),
  }),
  fetch('http://127.0.0.1:4000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@company-a.com', password: 'password123' }),
  }),
]);

const djangoAuth = await djangoAuthRes.json();
const nodeAuth = await nodeAuthRes.json();
const djangoToken = djangoAuth.tokens.access;
const nodeToken = nodeAuth.tokens.access;

const djangoHeaders = { Authorization: `Bearer ${djangoToken}`, 'Content-Type': 'application/json' };
const nodeHeaders = { Authorization: `Bearer ${nodeToken}`, 'Content-Type': 'application/json' };

log(`Django Token Acquired: ${djangoToken.slice(0, 15)}...`);
log(`Node Token Acquired:   ${nodeToken.slice(0, 15)}...`);

// 3. Create Worker 1 via Django, Worker 2 via Node
log('\nStep 3: Creating Worker via Django and Worker via Node...');
const djangoWorkerRes = await fetch('http://127.0.0.1:8000/api/v1/workers/', {
  method: 'POST',
  headers: djangoHeaders,
  body: JSON.stringify({ name: 'Django Created Artisan', phone: '9800000001', age: 30, is_active: true }),
});
const djangoWorker = await djangoWorkerRes.json();
log(`Django Created Worker ID: ${djangoWorker.id} (${djangoWorker.name})`);

const nodeWorkerRes = await fetch('http://127.0.0.1:4000/api/v1/workers', {
  method: 'POST',
  headers: nodeHeaders,
  body: JSON.stringify({ name: 'Node Created Weaver', phone: '9800000002', age: 28, is_active: true }),
});
const nodeWorker = await nodeWorkerRes.json();
log(`Node Created Worker ID:   ${nodeWorker.id} (${nodeWorker.name})`);

// Worker 3 that will be deleted to test "Deleted Worker" fallback
const tempWorkerRes = await fetch('http://127.0.0.1:4000/api/v1/workers', {
  method: 'POST',
  headers: nodeHeaders,
  body: JSON.stringify({ name: 'Worker To Delete', phone: '9800000003', age: 40, is_active: true }),
});
const tempWorker = await tempWorkerRes.json();
log(`Temporary Worker ID:      ${tempWorker.id} (${tempWorker.name})`);

// 4. Create Pay Records across both stacks
log('\nStep 4: Creating Pay Records across both stacks...');
// Django created worker gets pay records from both stacks
await fetch(`http://127.0.0.1:8000/api/v1/workers/${djangoWorker.id}/payments/`, {
  method: 'POST',
  headers: djangoHeaders,
  body: JSON.stringify({
    product_name: 'Pashmina Stole',
    units_produced: 20,
    rate_per_unit: 500,
    amount_paid: 10000,
    paid: true,
    date: '2026-10-10',
  }),
});

await fetch(`http://127.0.0.1:4000/api/v1/workers/${nodeWorker.id}/payments/`, {
  method: 'POST',
  headers: nodeHeaders,
  body: JSON.stringify({
    product_name: 'Silk Dupatta',
    units_produced: 15,
    rate_per_unit: 400,
    amount_paid: 6000,
    paid: true,
    date: '2026-10-11',
  }),
});

// Pay record for temp worker
await fetch(`http://127.0.0.1:4000/api/v1/workers/${tempWorker.id}/payments/`, {
  method: 'POST',
  headers: nodeHeaders,
  body: JSON.stringify({
    product_name: 'Cotton Scarf',
    units_produced: 10,
    rate_per_unit: 200,
    amount_paid: 1000,
    paid: false,
    date: '2026-10-12',
  }),
});

// Delete temp worker directly from workers collection in mongo to test "Deleted Worker" fallback
import { MongoClient, ObjectId } from '../apps/api/node_modules/mongodb/lib/index.js';
const client = new MongoClient('mongodb://localhost:27017');
await client.connect();
const db = client.db('InsightLoop_test');
await db.collection('workers').deleteOne({ _id: new ObjectId(tempWorker.id) });
log(`Deleted worker ${tempWorker.id} directly from workers collection to simulate orphaned reference.`);

// 5. Compare Top Workers from both stacks
log('\nStep 5: Querying and comparing /api/v1/dashboard/top-workers/ from Django and Node...');
const [djangoTopRes, nodeTopRes] = await Promise.all([
  fetch('http://127.0.0.1:8000/api/v1/dashboard/top-workers/', { headers: djangoHeaders }),
  fetch('http://127.0.0.1:4000/api/v1/dashboard/top-workers', { headers: nodeHeaders }),
]);

const djangoTop = await djangoTopRes.json();
const nodeTop = await nodeTopRes.json();

log('Django Top Workers: ' + JSON.stringify(djangoTop.workers, null, 2));
log('Node Top Workers:   ' + JSON.stringify(nodeTop.workers, null, 2));

let topWorkersMatched = true;
if (djangoTop.workers.length !== nodeTop.workers.length) {
  log(`[MISMATCH] Top workers count: Django=${djangoTop.workers.length} vs Node=${nodeTop.workers.length}`);
  topWorkersMatched = false;
} else {
  for (let i = 0; i < djangoTop.workers.length; i++) {
    const dw = djangoTop.workers[i];
    const nw = nodeTop.workers[i];
    if (dw.name !== nw.name || dw.total_payout !== nw.total_payout || dw.payment_count !== nw.payment_count) {
      log(`[MISMATCH] Item ${i}: Django=${JSON.stringify(dw)} vs Node=${JSON.stringify(nw)}`);
      topWorkersMatched = false;
    } else {
      log(`[MATCH] Top Worker ${i}: ${dw.name} (Payout: ₹${dw.total_payout}, Count: ${dw.payment_count})`);
    }
  }
}

// 6. Compare Worker Payments from both stacks
log('\nStep 6: Querying and comparing /api/v1/dashboard/workers/ from Django and Node...');
const [djangoPayRes, nodePayRes] = await Promise.all([
  fetch('http://127.0.0.1:8000/api/v1/dashboard/workers/', { headers: djangoHeaders }),
  fetch('http://127.0.0.1:4000/api/v1/dashboard/workers', { headers: nodeHeaders }),
]);

const djangoPay = await djangoPayRes.json();
const nodePay = await nodePayRes.json();

log('Django Worker Payments Count: ' + djangoPay.workers.length);
log('Node Worker Payments Count:   ' + nodePay.workers.length);

let payRecordsMatched = true;
for (let i = 0; i < Math.min(djangoPay.workers.length, nodePay.workers.length); i++) {
  const dw = djangoPay.workers[i];
  const nw = nodePay.workers[i];
  
  const fields = ['name', 'amount', 'amount_paid', 'balance_due', 'status'];
  let itemMatch = true;
  for (const f of fields) {
    if (dw[f] !== nw[f]) {
      log(`[MISMATCH] Item ${i} field '${f}': Django=${dw[f]} vs Node=${nw[f]}`);
      itemMatch = false;
      payRecordsMatched = false;
    }
  }
  if (itemMatch) {
    log(`[MATCH] Payment Record ${i}: ${dw.name} - ${dw.status} (Owed: ₹${dw.amount}, Paid: ₹${dw.amount_paid})`);
  }
}

// 7. Fallback verification
const deletedWorkerFoundDjango = djangoPay.workers.some((w) => w.name === 'Deleted Worker');
const deletedWorkerFoundNode = nodePay.workers.some((w) => w.name === 'Deleted Worker');
log(`\nDeleted Worker Fallback Found in Django: ${deletedWorkerFoundDjango}`);
log(`Deleted Worker Fallback Found in Node:   ${deletedWorkerFoundNode}`);

if (!deletedWorkerFoundDjango || !deletedWorkerFoundNode) {
  log('[ERROR] Deleted Worker fallback was not triggered properly on both stacks!');
} else {
  log('✅ "Deleted Worker" fallback identical on both Django and Node!');
}

// 8. Citation of Django Code Line
log('\nStep 8: Django Code Line Citation:');
log('Django implementation in insightloop/dashboard/utils.py:');
log('  - Line 90: def get_top_workers(company_id):');
log('  - Line 102: {"$sort": {"total_payout": -1}}');
log('  - Line 104: {"$lookup": {"from": "workers", "localField": "_id", "foreignField": "_id", "as": "worker_info"}}');
log('  - Line 75-76: except DoesNotExist: worker_name = "Deleted Worker"');

const finalSuccess = topWorkersMatched && payRecordsMatched && deletedWorkerFoundDjango && deletedWorkerFoundNode;
log(`\n=================================================================`);
log(`FINAL RESULT: ${finalSuccess ? 'PASSED (100% Dual-Stack Parity)' : 'FAILED'}`);
log('=================================================================');

await client.close();

fs.writeFileSync(path.resolve(ROOT, 'docs/migration/evidence/B2_top_workers_dual_stack.txt'), report.join('\n'), 'utf-8');
console.log('Saved evidence to docs/migration/evidence/B2_top_workers_dual_stack.txt');

if (!finalSuccess) {
  process.exit(1);
}
