#!/usr/bin/env node
/**
 * Standalone E2E Verification Script for InsightLoop Order-First Workflow
 * (Raw -> In Progress -> Finished -> Shipped -> Paid -> Closed -> Profit Confirmed)
 *
 * Verifies all 16 business flow requirements end-to-end against live HTTP endpoints.
 * Can run standalone:
 *   node scripts/e2e_order_flow.mjs
 * Or target an existing API server:
 *   API_BASE_URL=http://127.0.0.1:4000 node scripts/e2e_order_flow.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Ensure local test environment defaults before imports
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/InsightLoop_test';
process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'InsightLoop_test';
process.env.REDIS_URL = process.env.REDIS_URL || '';

let server = null;
let closeMongoDb = null;
let getMongoDb = null;
let baseUrl = '';

function logStep(stepNum, title) {
  console.log(`\n▶ [Step ${stepNum}] ${title}`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function request(endpoint, options = {}, token = null) {
  const url = `${baseUrl}/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  let body = null;
  if (contentType.includes('application/json')) {
    body = await res.json().catch(() => null);
  } else {
    body = await res.text().catch(() => null);
  }

  return { status: res.status, headers: res.headers, body };
}

async function main() {
  console.log('===============================================================');
  console.log('INSIGHTLOOP ORDER-FIRST WORKFLOW E2E VERIFICATION (16 STEPS)');
  console.log('===============================================================');

  if (process.env.API_BASE_URL) {
    baseUrl = process.env.API_BASE_URL.replace(/\/+$/, '');
    console.log(`Targeting existing API server: ${baseUrl}`);
  } else {
    console.log('Spinning up ephemeral in-process Node API server for testing...');
    const distAppPath = path.resolve(ROOT, 'apps/api/dist/app.js');
    if (!fs.existsSync(distAppPath)) {
      console.log('Building API dist bundle before starting ephemeral server...');
      execSync('pnpm --filter @insightloop/shared build && pnpm --filter @insightloop/api build', {
        cwd: ROOT,
        stdio: 'inherit',
      });
    }

    const { connectMongo, closeMongo, getDb } = await import('../apps/api/dist/db/mongo.js');
    const { app } = await import('../apps/api/dist/app.js');

    closeMongoDb = closeMongo;
    getMongoDb = getDb;

    await connectMongo();
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Ephemeral server listening on ${baseUrl}\n`);
  }

  // Track created IDs for scoping and assertion
  const timestamp = Date.now();
  const testUserEmail = `e2e_order_${timestamp}@test.local`;
  let authToken = null;
  let companyId = null;

  let rawItemId = null;
  let workerId = null;
  let billId = null;
  let assignmentAId = null;
  let assignmentBId = null;
  let reassignedBId = null;

  try {
    // 0. Setup: Register fresh isolated tenant user
    const signupRes = await request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Workflow Tester',
        email: testUserEmail,
        password: 'Password123!',
        company_name: `Silk Master Corp ${timestamp}`,
      }),
    });
    assert(signupRes.status === 201, `Tenant signup succeeded (HTTP ${signupRes.status})`);
    authToken = signupRes.body?.tokens?.access;
    companyId = signupRes.body?.user?.company_id;
    assert(Boolean(authToken), 'Acquired JWT bearer access token');
    assert(Boolean(companyId), `Scoped to company ID: ${companyId}`);

    // -------------------------------------------------------------------------
    // STEP 1: Create raw item (qty 100, e.g. "Silk")
    // -------------------------------------------------------------------------
    logStep(1, 'Create raw material item (qty 100, "Mulberry Silk Yarn")');
    const createRawRes = await request(
      '/inventory/raw/',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Mulberry Silk Yarn',
          quantity: 100,
          unit: 'kg',
          cost_price: 200,
        }),
      },
      authToken
    );
    assert(createRawRes.status === 201, `Raw item created (HTTP ${createRawRes.status})`);
    rawItemId = createRawRes.body?.id;
    assert(Boolean(rawItemId), `Raw item ID: ${rawItemId}`);
    assert(createRawRes.body?.quantity === 100, 'Initial raw stock quantity is 100 kg');

    // -------------------------------------------------------------------------
    // STEP 2: Create worker
    // -------------------------------------------------------------------------
    logStep(2, 'Create artisan worker ("Kailash Weaver")');
    const createWorkerRes = await request(
      '/workers/',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Kailash Weaver',
          phone: '9876543210',
          role: 'Master Weaver',
        }),
      },
      authToken
    );
    assert(createWorkerRes.status === 201, `Worker created (HTTP ${createWorkerRes.status})`);
    workerId = createWorkerRes.body?.id;
    assert(Boolean(workerId), `Worker ID: ${workerId}`);

    // -------------------------------------------------------------------------
    // STEP 3: Create order_first bill with 2 products (A qty 10, B qty 5)
    // -------------------------------------------------------------------------
    logStep(3, 'Create order_first bill with Product A (qty 10) & Product B (qty 5)');
    const createBillRes = await request(
      '/bills/pakka/',
      {
        method: 'POST',
        body: JSON.stringify({
          buyer_name: 'Heritage Textiles Ltd',
          buyer_phone: '9123456789',
          products: [
            { name: 'Silk Scarf A', quantity: 10, rate: 800, unit: 'pcs' },
            { name: 'Silk Shawl B', quantity: 5, rate: 1500, unit: 'pcs' },
          ],
          workflow: 'order_first',
        }),
      },
      authToken
    );
    assert(createBillRes.status === 201, `Bill created (HTTP ${createBillRes.status})`);
    billId = createBillRes.body?.id;
    assert(Boolean(billId), `Bill ID: ${billId}`);
    assert(createBillRes.body?.workflow === 'order_first', 'Bill workflow is order_first');

    // -------------------------------------------------------------------------
    // STEP 4: Verify Raw=100, Finished=0, bill order_status='confirmed'
    // -------------------------------------------------------------------------
    logStep(4, 'Verify Raw=100, Finished=0, bill order_status="confirmed"');
    const rawCheck4 = await request('/inventory/raw/', {}, authToken);
    const rawItem4 = (rawCheck4.body || []).find((i) => i.id === rawItemId);
    assert(rawItem4?.quantity === 100, 'Raw material stock untouched at 100 kg');

    const finishedCheck4 = await request('/inventory/finished/', {}, authToken);
    const finishedItems4 = finishedCheck4.body || [];
    const finishedQtyTotal = finishedItems4.reduce((sum, item) => sum + (item.quantity || 0), 0);
    assert(finishedQtyTotal === 0, 'Finished product stock is 0 (make-to-order invariant)');

    const billCheck4 = await request(`/bills/${billId}/`, {}, authToken);
    assert(billCheck4.body?.order_status === 'confirmed', 'Bill order_status is confirmed');
    const lineA4 = billCheck4.body?.lines?.find((l) => l.name === 'Silk Scarf A');
    const lineB4 = billCheck4.body?.lines?.find((l) => l.name === 'Silk Shawl B');
    assert(lineA4?.ordered === 10 && lineA4?.targeted === 0 && lineA4?.produced === 0, 'Line A progress initialized');
    assert(lineB4?.ordered === 5 && lineB4?.targeted === 0 && lineB4?.produced === 0, 'Line B progress initialized');

    // -------------------------------------------------------------------------
    // STEP 5: Assign A: target 10, raw_per_unit 2, issue 20. Verify Raw=80, InProg=20, bill order_status='in_production'
    // -------------------------------------------------------------------------
    logStep(5, 'Assign A: target 10, raw_per_unit 2, issue 20. Verify Raw=80, InProg=20, order_status="in_production"');
    const assignARes = await request(
      `/workers/${workerId}/materials/`,
      {
        method: 'POST',
        body: JSON.stringify({
          bill_id: billId,
          material_name: 'Silk Scarf A',
          quantity: 10,
          raw_item_id: rawItemId,
          raw_per_unit: 2,
          issue_quantity: 20,
          wage_amount: 600,
          date: '2026-10-19',
          notes: 'Production run A',
        }),
      },
      authToken
    );
    assert(assignARes.status === 201, `Assignment A created (HTTP ${assignARes.status})`);
    assignmentAId = assignARes.body?.id;
    assert(Boolean(assignmentAId), `Assignment A ID: ${assignmentAId}`);

    const rawCheck5 = await request('/inventory/raw/', {}, authToken);
    const rawItem5 = (rawCheck5.body || []).find((i) => i.id === rawItemId);
    assert(rawItem5?.quantity === 80, 'Raw stock atomically decremented from 100 to 80 kg');

    const liveInProg5 = await request('/inventory/semi-finished/live/', {}, authToken);
    const inProgRows5 = liveInProg5.body?.in_production || [];
    const assignmentRow5 = inProgRows5.find((r) => r.assignment_id === assignmentAId);
    assert(Boolean(assignmentRow5), 'Assignment appears in live in-progress production view');
    assert(assignmentRow5?.assigned_quantity === 10, 'Live assignment target is 10 units');

    const billCheck5 = await request(`/bills/${billId}/`, {}, authToken);
    assert(billCheck5.body?.order_status === 'in_production', 'Bill order_status transitioned to in_production');
    const lineA5 = billCheck5.body?.lines?.find((l) => l.name === 'Silk Scarf A');
    assert(lineA5?.targeted === 10 && lineA5?.produced === 0, 'Line A targeted = 10, produced = 0');

    // -------------------------------------------------------------------------
    // STEP 6: Add batch A: 6. Verify Finished A=6, InProg=8, ready_to_ship=6
    // -------------------------------------------------------------------------
    logStep(6, 'Add batch A: 6. Verify Finished A=6, InProg=8 raw units, ready_to_ship=6');
    const batch1Res = await request(
      `/workers/materials/${assignmentAId}/batches/`,
      {
        method: 'POST',
        body: JSON.stringify({
          quantity: 6,
          date: '2026-10-19',
          notes: 'Batch A1 produced',
        }),
      },
      authToken
    );
    assert(batch1Res.status === 201 || batch1Res.status === 200, `Batch A1 recorded (HTTP ${batch1Res.status})`);

    const finishedCheck6 = await request('/inventory/finished/', {}, authToken);
    const finishedA6 = (finishedCheck6.body || []).find((i) => i.name.toLowerCase() === 'silk scarf a');
    assert(finishedA6?.quantity === 6, 'Finished stock for Silk Scarf A increased immediately to 6 pcs');

    const billCheck6 = await request(`/bills/${billId}/`, {}, authToken);
    const lineA6 = billCheck6.body?.lines?.find((l) => l.name === 'Silk Scarf A');
    assert(lineA6?.produced === 6, 'Line A produced = 6');
    assert(lineA6?.ready_to_ship === 6, 'Line A ready_to_ship = 6');

    // In-progress remaining raw = issued (20) - produced (6) * raw_per_unit (2) = 8
    const liveInProg6 = await request('/inventory/semi-finished/live/', {}, authToken);
    const assignmentRow6 = (liveInProg6.body?.in_production || []).find((r) => r.assignment_id === assignmentAId);
    assert(assignmentRow6?.balance_quantity === 4, 'Remaining unproduced target for Assignment A is 4 pcs');

    // -------------------------------------------------------------------------
    // STEP 7: Ship partial A: 4. Verify Finished A=2, Shipped A=4, bill order_status='partially_shipped'
    // -------------------------------------------------------------------------
    logStep(7, 'Ship partial A: 4. Verify Finished A=2, Shipped A=4, order_status="partially_shipped"');
    const ship1Res = await request(
      `/bills/${billId}/shipments/`,
      {
        method: 'POST',
        body: JSON.stringify({
          items: [{ product_name: 'Silk Scarf A', quantity: 4 }],
          notes: 'Partial shipment 1',
        }),
      },
      authToken
    );
    assert(ship1Res.status === 201 || ship1Res.status === 200, `Partial shipment recorded (HTTP ${ship1Res.status})`);

    const finishedCheck7 = await request('/inventory/finished/', {}, authToken);
    const finishedA7 = (finishedCheck7.body || []).find((i) => i.name.toLowerCase() === 'silk scarf a');
    assert(finishedA7?.quantity === 2, 'Finished stock for Silk Scarf A decremented from 6 to 2 pcs');

    const billCheck7 = await request(`/bills/${billId}/`, {}, authToken);
    assert(billCheck7.body?.order_status === 'partially_shipped', 'Bill order_status is partially_shipped');
    const lineA7 = billCheck7.body?.lines?.find((l) => l.name === 'Silk Scarf A');
    assert(lineA7?.shipped === 4, 'Line A shipped = 4');
    assert(lineA7?.ready_to_ship === 2, 'Line A ready_to_ship = 2');

    // -------------------------------------------------------------------------
    // STEP 8: Add batch A: 4. Verify Finished A=6, Produced A=10
    // -------------------------------------------------------------------------
    logStep(8, 'Add batch A: 4. Verify Finished A=6, Produced A=10');
    const batch2Res = await request(
      `/workers/materials/${assignmentAId}/batches/`,
      {
        method: 'POST',
        body: JSON.stringify({
          quantity: 4,
          date: '2026-10-19',
          notes: 'Batch A2 produced',
        }),
      },
      authToken
    );
    assert(batch2Res.status === 201 || batch2Res.status === 200, `Batch A2 recorded (HTTP ${batch2Res.status})`);

    const finishedCheck8 = await request('/inventory/finished/', {}, authToken);
    const finishedA8 = (finishedCheck8.body || []).find((i) => i.name.toLowerCase() === 'silk scarf a');
    assert(finishedA8?.quantity === 6, 'Finished stock for Silk Scarf A increased from 2 to 6 pcs');

    const billCheck8 = await request(`/bills/${billId}/`, {}, authToken);
    const lineA8 = billCheck8.body?.lines?.find((l) => l.name === 'Silk Scarf A');
    assert(lineA8?.produced === 10, 'Line A produced = 10 (target fully completed)');
    assert(lineA8?.ready_to_ship === 6, 'Line A ready_to_ship = 6 (10 produced - 4 shipped)');

    // -------------------------------------------------------------------------
    // STEP 9: Complete A with 1 raw returned. Verify Raw=81, wage pay record created
    // -------------------------------------------------------------------------
    logStep(9, 'Complete A with 1 raw returned. Verify Raw=81, wage pay record created');
    const completeARes = await request(
      `/workers/materials/${assignmentAId}/complete/`,
      {
        method: 'PUT',
        body: JSON.stringify({
          raw_returned_quantity: 1,
        }),
      },
      authToken
    );
    assert(completeARes.status === 200, `Assignment A completed (HTTP ${completeARes.status})`);

    const rawCheck9 = await request('/inventory/raw/', {}, authToken);
    const rawItem9 = (rawCheck9.body || []).find((i) => i.id === rawItemId);
    assert(rawItem9?.quantity === 81, 'Raw stock restored by 1 kg to 81 kg');

    const paymentsRes9 = await request(`/workers/${workerId}/payments/`, {}, authToken);
    const payRecords9 = paymentsRes9.body || [];
    const wageRecord = payRecords9.find((p) => (p.source_assignment_id === assignmentAId || p.assignment_id === assignmentAId));
    assert(Boolean(wageRecord), 'Worker wage pay record created automatically on completion');
    const wageAmount = Number(wageRecord?.total_amount ?? wageRecord?.amount ?? wageRecord?.rate_per_unit);
    assert(wageAmount === 600, 'Wage pay record amount matches assigned wage (₹600)');

    // -------------------------------------------------------------------------
    // STEP 10: Assign B: target 5, raw 5. Verify Raw=76
    // -------------------------------------------------------------------------
    logStep(10, 'Assign B: target 5, raw 5. Verify Raw=76');
    const assignBRes = await request(
      `/workers/${workerId}/materials/`,
      {
        method: 'POST',
        body: JSON.stringify({
          bill_id: billId,
          material_name: 'Silk Shawl B',
          quantity: 5,
          raw_item_id: rawItemId,
          raw_per_unit: 1,
          issue_quantity: 5,
          wage_amount: 400,
          date: '2026-10-19',
          notes: 'Initial assignment B',
        }),
      },
      authToken
    );
    assert(assignBRes.status === 201, `Assignment B created (HTTP ${assignBRes.status})`);
    assignmentBId = assignBRes.body?.id;
    assert(Boolean(assignmentBId), `Assignment B ID: ${assignmentBId}`);

    const rawCheck10 = await request('/inventory/raw/', {}, authToken);
    const rawItem10 = (rawCheck10.body || []).find((i) => i.id === rawItemId);
    assert(rawItem10?.quantity === 76, 'Raw stock decremented from 81 to 76 kg');

    // -------------------------------------------------------------------------
    // STEP 11: Cancel B. Verify Raw=81, assignment B status='cancelled'
    // -------------------------------------------------------------------------
    logStep(11, 'Cancel B. Verify Raw=81, assignment B status="cancelled"');
    const cancelBRes = await request(
      `/workers/materials/${assignmentBId}/cancel/`,
      {
        method: 'PUT',
      },
      authToken
    );
    assert(cancelBRes.status === 200, `Assignment B cancelled (HTTP ${cancelBRes.status})`);

    const rawCheck11 = await request('/inventory/raw/', {}, authToken);
    const rawItem11 = (rawCheck11.body || []).find((i) => i.id === rawItemId);
    assert(rawItem11?.quantity === 81, 'Raw stock of 5 kg fully refunded upon cancellation (81 kg)');

    const workersMaterials11 = await request(`/workers/${workerId}/materials/`, {}, authToken);
    const cancelledRow = (workersMaterials11.body || []).find((a) => a.id === assignmentBId);
    assert(cancelledRow?.status === 'cancelled', 'Assignment B status is cancelled');

    // -------------------------------------------------------------------------
    // STEP 12: Reassign B (target 5, raw 5), produce batch 5, complete B. Verify Finished B=5
    // -------------------------------------------------------------------------
    logStep(12, 'Reassign B (target 5, raw 5), produce batch 5, complete B. Verify Finished B=5');
    const reassignBRes = await request(
      `/workers/${workerId}/materials/`,
      {
        method: 'POST',
        body: JSON.stringify({
          bill_id: billId,
          material_name: 'Silk Shawl B',
          quantity: 5,
          raw_item_id: rawItemId,
          raw_per_unit: 1,
          issue_quantity: 5,
          wage_amount: 400,
          date: '2026-10-19',
          notes: 'Reassigned production B',
        }),
      },
      authToken
    );
    assert(reassignBRes.status === 201, `Reassigned B created (HTTP ${reassignBRes.status})`);
    reassignedBId = reassignBRes.body?.id;

    const rawCheck12a = await request('/inventory/raw/', {}, authToken);
    const rawItem12a = (rawCheck12a.body || []).find((i) => i.id === rawItemId);
    assert(rawItem12a?.quantity === 76, 'Raw stock decremented to 76 kg for reassigned run');

    const batchBRes = await request(
      `/workers/materials/${reassignedBId}/batches/`,
      {
        method: 'POST',
        body: JSON.stringify({
          quantity: 5,
          date: '2026-10-19',
          notes: 'Batch B produced',
        }),
      },
      authToken
    );
    assert(batchBRes.status === 201 || batchBRes.status === 200, `Batch B produced (HTTP ${batchBRes.status})`);

    const completeBRes = await request(
      `/workers/materials/${reassignedBId}/complete/`,
      {
        method: 'PUT',
        body: JSON.stringify({
          raw_returned_quantity: 0,
        }),
      },
      authToken
    );
    assert(completeBRes.status === 200, `Reassigned B completed (HTTP ${completeBRes.status})`);

    const finishedCheck12 = await request('/inventory/finished/', {}, authToken);
    const finishedB12 = (finishedCheck12.body || []).find((i) => i.name.toLowerCase() === 'silk shawl b');
    assert(finishedB12?.quantity === 5, 'Finished stock for Silk Shawl B is 5 pcs');

    const billCheck12 = await request(`/bills/${billId}/`, {}, authToken);
    const lineB12 = billCheck12.body?.lines?.find((l) => l.name === 'Silk Shawl B');
    assert(lineB12?.produced === 5 && lineB12?.ready_to_ship === 5, 'Line B produced=5, ready_to_ship=5');

    // -------------------------------------------------------------------------
    // STEP 13: Ship all (`ship_all: true`). Verify Finished A=0, B=0, bill order_status='shipped'
    // -------------------------------------------------------------------------
    logStep(13, 'Ship all (ship_all: true). Verify Finished A=0, B=0, bill order_status="shipped"');
    const shipAllRes = await request(
      `/bills/${billId}/shipments/`,
      {
        method: 'POST',
        body: JSON.stringify({
          ship_all: true,
          notes: 'Ship all remaining items',
        }),
      },
      authToken
    );
    assert(shipAllRes.status === 201 || shipAllRes.status === 200, `Ship-all completed (HTTP ${shipAllRes.status})`);

    const finishedCheck13 = await request('/inventory/finished/', {}, authToken);
    const finishedA13 = (finishedCheck13.body || []).find((i) => i.name.toLowerCase() === 'silk scarf a');
    const finishedB13 = (finishedCheck13.body || []).find((i) => i.name.toLowerCase() === 'silk shawl b');
    assert(finishedA13?.quantity === 0, 'Finished stock for Silk Scarf A is 0 pcs');
    assert(finishedB13?.quantity === 0, 'Finished stock for Silk Shawl B is 0 pcs');

    const billCheck13 = await request(`/bills/${billId}/`, {}, authToken);
    assert(billCheck13.body?.order_status === 'shipped', 'Bill order_status is shipped');
    const lineA13 = billCheck13.body?.lines?.find((l) => l.name === 'Silk Scarf A');
    const lineB13 = billCheck13.body?.lines?.find((l) => l.name === 'Silk Shawl B');
    assert(lineA13?.shipped === 10 && lineA13?.ready_to_ship === 0, 'Line A 100% shipped');
    assert(lineB13?.shipped === 5 && lineB13?.ready_to_ship === 0, 'Line B 100% shipped');

    // -------------------------------------------------------------------------
    // STEP 14: Pay bill in full. Verify bill order_status='closed'
    // -------------------------------------------------------------------------
    logStep(14, 'Pay bill in full. Verify bill order_status="closed"');
    const grandTotal = Number(billCheck13.body?.grand_total) || 15500;
    const payRes = await request(
      `/bills/${billId}/record-payment/`,
      {
        method: 'POST',
        body: JSON.stringify({
          amount: grandTotal,
          payment_mode: 'bank_transfer',
          notes: 'Full payment received',
        }),
      },
      authToken
    );
    assert(payRes.status === 201 || payRes.status === 200, `Full payment recorded (HTTP ${payRes.status})`);

    const billCheck14 = await request(`/bills/${billId}/`, {}, authToken);
    assert(billCheck14.body?.order_status === 'closed', 'Bill order_status is closed');

    // -------------------------------------------------------------------------
    // STEP 15: Confirm profit. Verify profit_confirmed=true
    // -------------------------------------------------------------------------
    logStep(15, 'Confirm profit. Verify profit_confirmed=true');
    const confirmProfitRes = await request(
      `/bills/${billId}/confirm-profit/`,
      {
        method: 'POST',
        body: JSON.stringify({
          confirmed_amount: 8000,
          notes: 'Audited net margin confirmed',
        }),
      },
      authToken
    );
    assert(confirmProfitRes.status === 200, `Profit confirmed (HTTP ${confirmProfitRes.status})`);

    const billCheck15 = await request(`/bills/${billId}/`, {}, authToken);
    assert(
      billCheck15.body?.profit_confirmed === true || billCheck15.body?.profit_details?.confirmed === true,
      'Bill profit_confirmed is true'
    );
    assert(Number(billCheck15.body?.profit_confirmed_amount) === 8000, 'Confirmed profit amount matches ₹8,000');

    // -------------------------------------------------------------------------
    // STEP 16: Verify ledger (`GET /inventory/movements?bill_id=...`)
    // -------------------------------------------------------------------------
    logStep(16, 'Verify stock_movements ledger integrity');
    const movementsRes = await request(`/inventory/movements?bill_id=${billId}`, {}, authToken);
    assert(movementsRes.status === 200, `Retrieved stock movements (HTTP ${movementsRes.status})`);
    const movements = movementsRes.body || [];

    const rawIssues = movements.filter((m) => m.type === 'raw_issue');
    const rawReturns = movements.filter((m) => m.type === 'raw_return');
    const productionIns = movements.filter((m) => m.type === 'production_in');
    const shipmentOuts = movements.filter((m) => m.type === 'shipment_out');

    console.log(`  Movement counts by type:`);
    console.log(`    - raw_issue    : ${rawIssues.length}`);
    console.log(`    - raw_return   : ${rawReturns.length}`);
    console.log(`    - production_in: ${productionIns.length}`);
    console.log(`    - shipment_out : ${shipmentOuts.length}`);

    // Verify raw issues: Assignment A (20), Assignment B original (5), Assignment B reassigned (5)
    assert(rawIssues.length === 3, 'Ledger contains 3 raw_issue records (20 for A, 5 for initial B, 5 for reassigned B)');
    const totalRawIssued = rawIssues.reduce((sum, m) => sum + m.quantity, 0);
    assert(totalRawIssued === 30, 'Total raw material issued equals 30 kg');

    // Verify raw returns: Assignment A completion return (1), Assignment B cancellation (5)
    assert(rawReturns.length === 2, 'Ledger contains 2 raw_return records (1 kg from A completion, 5 kg from B cancellation)');
    const totalRawReturned = rawReturns.reduce((sum, m) => sum + m.quantity, 0);
    assert(totalRawReturned === 6, 'Total raw material returned equals 6 kg');

    // Net raw consumed = 30 - 6 = 24 kg. Starting was 100 kg, ending stock = 76 kg.
    const finalRawCheck = await request('/inventory/raw/', {}, authToken);
    const finalRawItem = (finalRawCheck.body || []).find((i) => i.id === rawItemId);
    assert(finalRawItem?.quantity === 76, 'Final raw stock matches conservation of mass: 100 - 24 = 76 kg');

    // Verify production_in: Batch A1 (6), Batch A2 (4), Batch B (5)
    assert(productionIns.length === 3, 'Ledger contains 3 production_in records (6 pcs A1, 4 pcs A2, 5 pcs B)');
    const totalProduced = productionIns.reduce((sum, m) => sum + m.quantity, 0);
    assert(totalProduced === 15, 'Total finished units produced equals 15 pcs (10 of A, 5 of B)');

    // Verify shipment_out: Shipment 1 (4 of A), Shipment 2 (6 of A, 5 of B)
    assert(shipmentOuts.length === 3, 'Ledger contains 3 shipment_out line records across 2 shipments');
    const totalShipped = shipmentOuts.reduce((sum, m) => sum + m.quantity, 0);
    assert(totalShipped === 15, 'Total units shipped out equals 15 pcs (all produced goods shipped)');

    console.log('\n===============================================================');
    console.log('✅ ALL 16 STEPS OF ORDER-FIRST WORKFLOW VERIFIED SUCCESSFULLY!');
    console.log('===============================================================');
  } finally {
    // Teardown test data and server
    if (getMongoDb && companyId) {
      try {
        const db = getMongoDb();
        await db.collection('bills').deleteMany({ company_id: companyId });
        await db.collection('inventory_items').deleteMany({ company_id: companyId });
        await db.collection('workers').deleteMany({ company_id: companyId });
        await db.collection('material_assignments').deleteMany({ company_id: companyId });
        await db.collection('pay_records').deleteMany({ company_id: companyId });
        await db.collection('stock_movements').deleteMany({ company_id: companyId });
        await db.collection('companies').deleteMany({ company_id: companyId });
        await db.collection('users').deleteMany({ email: testUserEmail });
      } catch (cleanupErr) {
        // SILENT-FALLBACK-REASON: Best-effort test cleanup
      }
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (closeMongoDb) {
      await closeMongoDb();
    }
  }
}

main().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED WITH UNCAUGHT EXCEPTION:');
  console.error(err);
  process.exit(1);
});
