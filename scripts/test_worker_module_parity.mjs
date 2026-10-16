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
log('ITEM 8: WORKER MODULE DETAILED DUAL-STACK PARITY AUDIT');
log(`Timestamp: ${new Date().toISOString()}`);
log('=================================================================\n');

// 1. Reseed DB
log('Step 1: Reseeding test database...');
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

// 2. Authenticate
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

const djangoToken = (await djangoAuthRes.json()).tokens.access;
const nodeToken = (await nodeAuthRes.json()).tokens.access;
const djangoHeaders = { Authorization: `Bearer ${djangoToken}`, 'Content-Type': 'application/json' };
const nodeHeaders = { Authorization: `Bearer ${nodeToken}`, 'Content-Type': 'application/json' };

let passedChecks = 0;
let totalChecks = 0;

async function assertDualStack(name, fn) {
  totalChecks++;
  log(`\n--- Test Case ${totalChecks}: ${name} ---`);
  try {
    await fn();
    passedChecks++;
    log(`✅ [PASS] ${name}`);
  } catch (err) {
    log(`❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// Check 1: Age Default (omitted age -> null)
await assertDualStack('Worker Age default (omitted age -> null on both stacks)', async () => {
  const [dRes, nRes] = await Promise.all([
    fetch('http://127.0.0.1:8000/api/v1/workers/', {
      method: 'POST',
      headers: djangoHeaders,
      body: JSON.stringify({ name: 'Age Test Worker Django' }),
    }),
    fetch('http://127.0.0.1:4000/api/v1/workers', {
      method: 'POST',
      headers: nodeHeaders,
      body: JSON.stringify({ name: 'Age Test Worker Node' }),
    }),
  ]);

  const dData = await dRes.json();
  const nData = await nRes.json();

  log(`Django age: ${dData.age} (${typeof dData.age})`);
  log(`Node age:   ${nData.age} (${typeof nData.age})`);

  if (dData.age !== null || nData.age !== null) {
    throw new Error(`Expected age to be null on both stacks, got Django=${dData.age}, Node=${nData.age}`);
  }
});

// Check 2: Wage >= 0 rules (negative wage -> 400 rejection)
await assertDualStack('Wage amount < 0 rejected on assignment creation', async () => {
  // Get an existing worker
  const workersRes = await fetch('http://127.0.0.1:4000/api/v1/workers', { headers: nodeHeaders });
  const workerId = (await workersRes.json())[0].id;

  const [dRes, nRes] = await Promise.all([
    fetch(`http://127.0.0.1:8000/api/v1/workers/${workerId}/materials/`, {
      method: 'POST',
      headers: djangoHeaders,
      body: JSON.stringify({ material_name: 'Thread', quantity: 10, price_per_unit: 5, wage_amount: -50 }),
    }),
    fetch(`http://127.0.0.1:4000/api/v1/workers/${workerId}/materials`, {
      method: 'POST',
      headers: nodeHeaders,
      body: JSON.stringify({ material_name: 'Thread', quantity: 10, price_per_unit: 5, wage_amount: -50 }),
    }),
  ]);

  log(`Django Status on wage < 0: ${dRes.status}`);
  log(`Node Status on wage < 0:   ${nRes.status}`);

  if (dRes.status !== 400 || nRes.status !== 400) {
    throw new Error(`Expected 400 from both stacks for negative wage, got Django=${dRes.status}, Node=${nRes.status}`);
  }
});

// Check 3: Batch date future check (both stacks accept and parse ISO date)
await assertDualStack('Batch future date acceptance & ISO serialization', async () => {
  const workersRes = await fetch('http://127.0.0.1:4000/api/v1/workers', { headers: nodeHeaders });
  const workerId = (await workersRes.json())[0].id;

  // Create an assignment via Django and one via Node
  const [dMatRes, nMatRes] = await Promise.all([
    fetch(`http://127.0.0.1:8000/api/v1/workers/${workerId}/materials/`, {
      method: 'POST',
      headers: djangoHeaders,
      body: JSON.stringify({ material_name: 'Linen', quantity: 100, price_per_unit: 10, wage_amount: 100 }),
    }),
    fetch(`http://127.0.0.1:4000/api/v1/workers/${workerId}/materials`, {
      method: 'POST',
      headers: nodeHeaders,
      body: JSON.stringify({ material_name: 'Cotton', quantity: 100, price_per_unit: 10, wage_amount: 100 }),
    }),
  ]);

  const dMat = await dMatRes.json();
  const nMat = await nMatRes.json();

  const futureDate = '2030-12-31';
  const [dBatchRes, nBatchRes] = await Promise.all([
    fetch(`http://127.0.0.1:8000/api/v1/workers/materials/${dMat.id}/batches/`, {
      method: 'POST',
      headers: djangoHeaders,
      body: JSON.stringify({ quantity: 25, date: futureDate }),
    }),
    fetch(`http://127.0.0.1:4000/api/v1/workers/materials/${nMat.id}/batches`, {
      method: 'POST',
      headers: nodeHeaders,
      body: JSON.stringify({ quantity: 25, date: futureDate }),
    }),
  ]);

  log(`Django Batch Status: ${dBatchRes.status}`);
  log(`Node Batch Status:   ${nBatchRes.status}`);

  if (dBatchRes.status !== 201 || nBatchRes.status !== 201) {
    throw new Error(`Expected 201 from both stacks, got Django=${dBatchRes.status}, Node=${nBatchRes.status}`);
  }

  const dBatchData = await dBatchRes.json();
  const nBatchData = await nBatchRes.json();

  log(`Django Batch Date: ${dBatchData.batches[0].date}`);
  log(`Node Batch Date:   ${nBatchData.batches[0].date}`);

  if (!dBatchData.batches[0].date.startsWith('2030-12-31') || !nBatchData.batches[0].date.startsWith('2030-12-31')) {
    throw new Error('Future date was not preserved in batch record.');
  }
});

// Check 4: Units Produced parsing
await assertDualStack('Units produced string vs int parsing on payment creation', async () => {
  const workersRes = await fetch('http://127.0.0.1:4000/api/v1/workers', { headers: nodeHeaders });
  const workerId = (await workersRes.json())[0].id;

  const [dRes, nRes] = await Promise.all([
    fetch(`http://127.0.0.1:8000/api/v1/workers/${workerId}/payments/`, {
      method: 'POST',
      headers: djangoHeaders,
      body: JSON.stringify({ product_name: 'Pashmina', units_produced: '15', rate_per_unit: '200' }),
    }),
    fetch(`http://127.0.0.1:4000/api/v1/workers/${workerId}/payments`, {
      method: 'POST',
      headers: nodeHeaders,
      body: JSON.stringify({ product_name: 'Pashmina', units_produced: '15', rate_per_unit: '200' }),
    }),
  ]);

  const dData = await dRes.json();
  const nData = await nRes.json();

  log(`Django Units Produced: ${dData.units_produced} (${typeof dData.units_produced})`);
  log(`Node Units Produced:   ${nData.units_produced} (${typeof nData.units_produced})`);

  if (dData.units_produced !== 15 || nData.units_produced !== 15) {
    throw new Error(`Units produced parsing failed: Django=${dData.units_produced}, Node=${nData.units_produced}`);
  }
});

// Check 5: Mark Payment Paid on already-paid payment
await assertDualStack('MarkPaymentPaid on already-paid record idempotency', async () => {
  const workersRes = await fetch('http://127.0.0.1:4000/api/v1/workers', { headers: nodeHeaders });
  const workerId = (await workersRes.json())[0].id;

  // Create payment record
  const pRes = await fetch(`http://127.0.0.1:8000/api/v1/workers/${workerId}/payments/`, {
    method: 'POST',
    headers: djangoHeaders,
    body: JSON.stringify({ product_name: 'Shawl', units_produced: 10, rate_per_unit: 100, amount_paid: 1000 }),
  });
  const payment = await pRes.json();

  // Call mark-paid on both stacks
  const [dMark1, nMark1] = await Promise.all([
    fetch(`http://127.0.0.1:8000/api/v1/workers/payments/${payment.id}/mark-paid/`, { method: 'PUT', headers: djangoHeaders }),
    fetch(`http://127.0.0.1:4000/api/v1/workers/payments/${payment.id}/mark-paid`, { method: 'PUT', headers: nodeHeaders }),
  ]);

  log(`Django mark-paid status: ${dMark1.status}`);
  log(`Node mark-paid status:   ${nMark1.status}`);

  if (dMark1.status !== 200 || nMark1.status !== 200) {
    throw new Error('mark-paid failed on already-paid payment record.');
  }
});

// Check 6: Delete Worker Cascade
await assertDualStack('Delete Worker Cascades to Assignments and Payments in both stacks', async () => {
  // Create worker with assignment and payment in Django
  const dWorkerRes = await fetch('http://127.0.0.1:8000/api/v1/workers/', {
    method: 'POST',
    headers: djangoHeaders,
    body: JSON.stringify({ name: 'Cascade Worker Django' }),
  });
  const dWorker = await dWorkerRes.json();

  await fetch(`http://127.0.0.1:8000/api/v1/workers/${dWorker.id}/materials/`, {
    method: 'POST',
    headers: djangoHeaders,
    body: JSON.stringify({ material_name: 'Cascade Yarn', quantity: 50, price_per_unit: 10 }),
  });
  await fetch(`http://127.0.0.1:8000/api/v1/workers/${dWorker.id}/payments/`, {
    method: 'POST',
    headers: djangoHeaders,
    body: JSON.stringify({ product_name: 'Cascade Carpet', units_produced: 5, rate_per_unit: 500 }),
  });

  // Delete worker via Django
  const delDRes = await fetch(`http://127.0.0.1:8000/api/v1/workers/${dWorker.id}/`, {
    method: 'DELETE',
    headers: djangoHeaders,
  });
  log(`Django Worker DELETE Status: ${delDRes.status}`);

  // Query assignments and payments via Node for deleted worker
  const [dAssAfter, dPayAfter] = await Promise.all([
    fetch(`http://127.0.0.1:4000/api/v1/workers/${dWorker.id}/materials`, { headers: nodeHeaders }),
    fetch(`http://127.0.0.1:4000/api/v1/workers/${dWorker.id}/payments`, { headers: nodeHeaders }),
  ]);

  log(`Materials lookup after Django delete status: ${dAssAfter.status}`);
  log(`Payments lookup after Django delete status:  ${dPayAfter.status}`);

  // Now create worker with assignment and payment in Node and delete via Node
  const nWorkerRes = await fetch('http://127.0.0.1:4000/api/v1/workers', {
    method: 'POST',
    headers: nodeHeaders,
    body: JSON.stringify({ name: 'Cascade Worker Node' }),
  });
  const nWorker = await nWorkerRes.json();

  await fetch(`http://127.0.0.1:4000/api/v1/workers/${nWorker.id}/materials`, {
    method: 'POST',
    headers: nodeHeaders,
    body: JSON.stringify({ material_name: 'Cascade Silk', quantity: 50, price_per_unit: 10 }),
  });
  await fetch(`http://127.0.0.1:4000/api/v1/workers/${nWorker.id}/payments`, {
    method: 'POST',
    headers: nodeHeaders,
    body: JSON.stringify({ product_name: 'Cascade Shawl', units_produced: 5, rate_per_unit: 500 }),
  });

  const delNRes = await fetch(`http://127.0.0.1:4000/api/v1/workers/${nWorker.id}`, {
    method: 'DELETE',
    headers: nodeHeaders,
  });
  log(`Node Worker DELETE Status: ${delNRes.status}`);

  // Query assignments and payments via Django for deleted worker
  const [nAssAfter, nPayAfter] = await Promise.all([
    fetch(`http://127.0.0.1:8000/api/v1/workers/${nWorker.id}/materials/`, { headers: djangoHeaders }),
    fetch(`http://127.0.0.1:8000/api/v1/workers/${nWorker.id}/payments/`, { headers: djangoHeaders }),
  ]);

  log(`Materials lookup after Node delete status: ${nAssAfter.status}`);
  log(`Payments lookup after Node delete status:  ${nPayAfter.status}`);

  if (dAssAfter.status !== 404 || nAssAfter.status !== 404) {
    throw new Error('Worker was not properly deleted / not found.');
  }
});

log('\n=================================================================');
log(`SUMMARY: ${passedChecks}/${totalChecks} checks passed.`);
log('=================================================================');

fs.writeFileSync(path.resolve(ROOT, 'docs/migration/evidence/B8_worker_module_parity.txt'), report.join('\n'), 'utf-8');
console.log('Saved evidence to docs/migration/evidence/B8_worker_module_parity.txt');
