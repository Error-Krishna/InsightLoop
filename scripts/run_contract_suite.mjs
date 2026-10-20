/**
 * Language-Agnostic HTTP Contract Test Runner & Golden Master Recorder
 *
 * Runs characterization tests against Node API (mode: assert) or records golden fixtures.
 * Strict isolation: operates exclusively against local test database.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:4000';
const MODE = process.argv.includes('--assert') ? 'assert' : 'record';
const FIXTURES_DIR = path.resolve(ROOT, 'apps/api/test/contracts/fixtures/endpoints');

// Helper to reseed test db
function seedTestDatabase() {
  console.log('--- Seeding test database (InsightLoop_test) ---');
  const env = {
    ...process.env,
    MONGODB_URI: 'mongodb://localhost:27017/InsightLoop_test',
    MONGODB_DB_NAME: 'InsightLoop_test',
  };
  const stdout = execSync(
    'npx tsx scripts/seed.ts',
    { cwd: ROOT, env, encoding: 'utf-8' }
  );
  console.log(stdout.trim());
}

// Deep normalizer for fixtures
function normalizeValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    // JWT token pattern (header.payload.signature)
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(val)) {
      return '<JWT_TOKEN>';
    }
    // Strict ISO-8601 timestamp: enforces naive ISO format without trailing Z
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(val)) {
      return '<ISO_TIMESTAMP>';
    }
    // UUID v4 or deterministic company UUID
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ||
      /^company-[ab]-uuid-\d{4}-\d{12}$/.test(val)
    ) {
      return '<UUID>';
    }
    // Prefixed MongoDB ObjectIds (e.g. assignment:6acff8...)
    if (/^[a-z_]+:[0-9a-f]{24}$/i.test(val)) {
      const prefix = val.split(':')[0];
      return `${prefix}:<OBJECT_ID>`;
    }
    // MongoDB ObjectId (24 hex chars)
    if (/^[0-9a-f]{24}$/i.test(val)) {
      return '<OBJECT_ID>';
    }
    // HTML document normalization
    if (val.includes('<!DOCTYPE html>')) {
      return '<HTML_DOCUMENT>';
    }
    return val;
  }
  if (typeof val === 'number') {
    return Math.round(val * 1e6) / 1e6;
  }
  if (Array.isArray(val)) {
    return val.map(normalizeValue);
  }
  if (typeof val === 'object') {
    const sorted = {};
    for (const key of Object.keys(val).sort()) {
      sorted[key] = normalizeValue(val[key]);
    }
    return sorted;
  }
  return val;
}

// Deep comparison helper for assert mode
function deepCompare(actual, expected, pathStr = '') {
  const normActual = normalizeValue(actual);
  const normExpected = normalizeValue(expected);

  if (typeof normActual !== typeof normExpected) {
    throw new Error(`Type mismatch at ${pathStr}: expected ${typeof normExpected}, got ${typeof normActual}`);
  }

  if (normExpected === '<JWT_TOKEN>' || normExpected === '<ISO_TIMESTAMP>' || normExpected === '<OBJECT_ID>' || normExpected === '<UUID>' || normExpected === '<HTML_DOCUMENT>') {
    if (normActual !== normExpected) {
      throw new Error(`Token/Pattern mismatch at ${pathStr}: expected pattern ${normExpected}, got ${JSON.stringify(normActual)}`);
    }
    return;
  }

  if (typeof normExpected !== 'object' || normExpected === null) {
    if (normActual !== normExpected) {
      throw new Error(`Value mismatch at ${pathStr}: expected ${JSON.stringify(normExpected)}, got ${JSON.stringify(normActual)}`);
    }
    return;
  }

  if (Array.isArray(normExpected)) {
    if (!Array.isArray(normActual)) {
      throw new Error(`Array mismatch at ${pathStr}: actual is not an array`);
    }
    if (normActual.length !== normExpected.length) {
      throw new Error(`Array length mismatch at ${pathStr}: expected ${normExpected.length}, got ${normActual.length}`);
    }
    for (let i = 0; i < normExpected.length; i++) {
      deepCompare(normActual[i], normExpected[i], `${pathStr}[${i}]`);
    }
    return;
  }

  const expectedKeys = Object.keys(normExpected).sort();
  const actualKeys = Object.keys(normActual).sort();

  for (const k of expectedKeys) {
    if (!(k in normActual)) {
      throw new Error(`Missing key at ${pathStr}: '${k}' not found in actual response`);
    }
    deepCompare(normActual[k], normExpected[k], pathStr ? `${pathStr}.${k}` : k);
  }

  for (const k of actualKeys) {
    if (!(k in normExpected)) {
      if ((k === 'code' || k === 'requestId') && ('detail' in normExpected || typeof normExpected === 'string')) {
        continue;
      }
      throw new Error(`Unexpected key at ${pathStr}: '${k}' present in actual response`);
    }
  }
}

async function request(method, endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { ...options.headers };
  let body = options.body;

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (res.status !== 204) {
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
  }

  return {
    status: res.status,
    contentType,
    data,
  };
}

async function runTest(testName, moduleName, fn, stats) {
  const fixtureFile = path.join(FIXTURES_DIR, moduleName, `${testName}.json`);
  try {
    const result = await fn();
    const normalized = {
      status: result.status,
      contentType: result.contentType,
      body: normalizeValue(result.data),
    };

    if (MODE === 'record') {
      fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
      fs.writeFileSync(fixtureFile, JSON.stringify(normalized, null, 2) + '\n');
      console.log(`  [RECORDED] ${moduleName}/${testName} -> status ${result.status}`);
      stats.recorded++;
    } else {
      if (!fs.existsSync(fixtureFile)) {
        throw new Error(`Fixture file does not exist: ${fixtureFile}`);
      }
      const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf-8'));
      if (result.status !== fixture.status) {
        throw new Error(`Status code mismatch: expected ${fixture.status}, got ${result.status}`);
      }
      deepCompare(normalized.body, fixture.body);
      console.log(`  [PASS] ${moduleName}/${testName}`);
      stats.passed++;
    }
    return result;
  } catch (err) {
    console.error(`  [FAIL] ${moduleName}/${testName}: ${err.message}`);
    stats.failed++;
    stats.errors.push({ testName, moduleName, error: err.message });
    return null;
  }
}

async function main() {
  console.log(`=======================================================`);
  console.log(`INSIGHTLOOP CONTRACT SUITE`);
  console.log(`Target: ${BASE_URL} | Mode: ${MODE}`);
  console.log(`=======================================================\n`);

  // Ensure deterministic seed
  seedTestDatabase();

  const stats = {
    total: 0,
    recorded: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Shared state across tests
  const state = {
    tokenA: null,
    tokenB: null,
    refreshA: null,
    companyAId: null,
    companyBId: null,
    userAId: null,
    kachaBillId: null,
    pakkaBillId: null,
    finishedItemId: null,
    tempFinishedItemId: null,
    tempBillId: null,
    warehouseId: null,
    workerId: null,
    assignmentId: null,
    payRecordId: null,
    insightId: null,
  };

  const authHeaderA = () => ({ Authorization: `Bearer ${state.tokenA}` });
  const authHeaderB = () => ({ Authorization: `Bearer ${state.tokenB}` });

  // ==========================================
  // MODULE 1: AUTH
  // ==========================================
  console.log('\n--- Module: Auth ---');
  await runTest('login_success_company_a', 'auth', async () => {
    const res = await request('POST', '/api/v1/auth/login/', {
      body: { email: 'alice@company-a.com', password: 'password123' },
    });
    if (res.data?.tokens?.access) {
      state.tokenA = res.data.tokens.access;
      state.refreshA = res.data.tokens.refresh;
      state.companyAId = res.data.user.company_id;
      state.userAId = res.data.user.id;
    }
    return res;
  }, stats);

  await runTest('login_success_company_b', 'auth', async () => {
    const res = await request('POST', '/api/v1/auth/login/', {
      body: { email: 'bob@company-b.com', password: 'password123' },
    });
    if (res.data?.tokens?.access) {
      state.tokenB = res.data.tokens.access;
      state.companyBId = res.data.user.company_id;
    }
    return res;
  }, stats);

  await runTest('login_invalid_password', 'auth', async () => {
    return request('POST', '/api/v1/auth/login/', {
      body: { email: 'alice@company-a.com', password: 'wrongpassword' },
    });
  }, stats);

  await runTest('login_unknown_email', 'auth', async () => {
    return request('POST', '/api/v1/auth/login/', {
      body: { email: 'unknown@company-a.com', password: 'password123' },
    });
  }, stats);

  await runTest('refresh_success', 'auth', async () => {
    return request('POST', '/api/v1/auth/refresh/', {
      body: { refresh: state.refreshA },
    });
  }, stats);

  await runTest('refresh_invalid', 'auth', async () => {
    return request('POST', '/api/v1/auth/refresh/', {
      body: { refresh: 'invalid.jwt.token' },
    });
  }, stats);

  await runTest('signup_duplicate_email', 'auth', async () => {
    return request('POST', '/api/v1/auth/signup/', {
      body: {
        name: 'Alice Duplicate',
        email: 'alice@company-a.com',
        password: 'password123',
        company: 'Duplicate Corp',
      },
    });
  }, stats);

  await runTest('signup_missing_fields', 'auth', async () => {
    return request('POST', '/api/v1/auth/signup/', {
      body: { name: 'Incomplete User' },
    });
  }, stats);

  await runTest('google_invalid_credential', 'auth', async () => {
    return request('POST', '/api/v1/auth/google/', {
      body: { credential: 'mock-invalid-google-token' },
    });
  }, stats);

  // ==========================================
  // MODULE 2: PROFILE & SETTINGS
  // ==========================================
  console.log('\n--- Module: Profile & Settings ---');
  await runTest('profile_get', 'profile', async () => {
    return request('GET', '/api/v1/profile/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('profile_update', 'profile', async () => {
    const form = new FormData();
    form.append('phone', '9998887776');
    form.append('location', 'Updated City A');
    return request('PUT', '/api/v1/profile/', {
      headers: authHeaderA(),
      body: form,
    });
  }, stats);

  await runTest('settings_get', 'profile', async () => {
    return request('GET', '/api/v1/profile/settings/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('settings_update', 'profile', async () => {
    return request('PUT', '/api/v1/profile/settings/', {
      headers: authHeaderA(),
      body: {
        realtime_dashboard_refresh: true,
        ai_assistant_enabled: true,
        comments: false,
        weekly_summary: true,
      },
    });
  }, stats);

  // ==========================================
  // MODULE 3: INVENTORY & WAREHOUSES
  // ==========================================
  console.log('\n--- Module: Inventory ---');
  await runTest('warehouses_list', 'inventory', async () => {
    const res = await request('GET', '/api/v1/inventory/warehouses/', {
      headers: authHeaderA(),
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      state.warehouseId = res.data[0].id;
    }
    return res;
  }, stats);

  await runTest('warehouses_create', 'inventory', async () => {
    return request('POST', '/api/v1/inventory/warehouses/', {
      headers: authHeaderA(),
      body: { name: 'North Annex', location: 'City North' },
    });
  }, stats);

  await runTest('warehouse_summary', 'inventory', async () => {
    return request('GET', '/api/v1/inventory/meta/warehouse-summary/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('finished_list', 'inventory', async () => {
    const res = await request('GET', '/api/v1/inventory/finished/', {
      headers: authHeaderA(),
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      state.finishedItemId = res.data[0].id;
    }
    return res;
  }, stats);

  await runTest('finished_create', 'inventory', async () => {
    const res = await request('POST', '/api/v1/inventory/finished/', {
      headers: authHeaderA(),
      body: {
        name: 'Dining Table',
        unit: 'pcs',
        selling_price: 12000.0,
        cost_price: 8000.0,
        quantity: 15.0,
        reorder_level: 3.0,
        warehouse_id: state.warehouseId,
      },
    });
    if (res.data?.id) {
      state.tempFinishedItemId = res.data.id;
    }
    return res;
  }, stats);

  await runTest('finished_update', 'inventory', async () => {
    return request('PUT', `/api/v1/inventory/finished/${state.tempFinishedItemId}/`, {
      headers: authHeaderA(),
      body: {
        name: 'Deluxe Dining Table',
        unit: 'pcs',
        selling_price: 13500.0,
        cost_price: 8500.0,
        quantity: 12.0,
        reorder_level: 4.0,
        warehouse_id: state.warehouseId,
      },
    });
  }, stats);

  await runTest('finished_delete', 'inventory', async () => {
    return request('DELETE', `/api/v1/inventory/finished/${state.tempFinishedItemId}/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('semi_finished_live', 'inventory', async () => {
    return request('GET', '/api/v1/inventory/semi-finished/live/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('raw_list', 'inventory', async () => {
    return request('GET', '/api/v1/inventory/raw/', {
      headers: authHeaderA(),
    });
  }, stats);

  // ==========================================
  // MODULE 4: WORKERS
  // ==========================================
  console.log('\n--- Module: Workers ---');
  await runTest('workers_list', 'workers', async () => {
    const res = await request('GET', '/api/v1/workers/', {
      headers: authHeaderA(),
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      state.workerId = res.data[0].id;
    }
    return res;
  }, stats);

  await runTest('workers_detail', 'workers', async () => {
    return request('GET', `/api/v1/workers/${state.workerId}/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('workers_create', 'workers', async () => {
    return request('POST', '/api/v1/workers/', {
      headers: authHeaderA(),
      body: {
        name: 'Sunil Joiner',
        age: 28,
        phone: '9876543299',
        address: 'West End',
        joining_date: '2026-01-15T00:00:00',
      },
    });
  }, stats);

  await runTest('workers_materials_list', 'workers', async () => {
    const res = await request('GET', `/api/v1/workers/${state.workerId}/materials/`, {
      headers: authHeaderA(),
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      state.assignmentId = res.data[0].id;
    }
    return res;
  }, stats);

  await runTest('workers_materials_create', 'workers', async () => {
    return request('POST', `/api/v1/workers/${state.workerId}/materials/`, {
      headers: authHeaderA(),
      body: {
        material_name: 'Chair Framing',
        quantity: 15,
        price_per_unit: 40.0,
        date: '2026-10-10T00:00:00',
        notes: 'Pre-cut wooden parts',
        wage_amount: 600.0,
      },
    });
  }, stats);

  await runTest('workers_batches_create', 'workers', async () => {
    return request('POST', `/api/v1/workers/materials/${state.assignmentId}/batches/`, {
      headers: authHeaderA(),
      body: {
        quantity: 5,
        date: '2026-10-12T00:00:00',
        notes: 'Delivered batch of 5',
      },
    });
  }, stats);

  await runTest('workers_complete', 'workers', async () => {
    return request('PUT', `/api/v1/workers/materials/${state.assignmentId}/complete/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('workers_complete_idempotent', 'workers', async () => {
    return request('PUT', `/api/v1/workers/materials/${state.assignmentId}/complete/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('workers_payments_list', 'workers', async () => {
    return request('GET', `/api/v1/workers/${state.workerId}/payments/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('workers_payments_create', 'workers', async () => {
    const res = await request('POST', `/api/v1/workers/${state.workerId}/payments/`, {
      headers: authHeaderA(),
      body: {
        product_name: 'Custom Armchair',
        units_produced: 10,
        rate_per_unit: 50.0,
        amount_paid: 200.0,
        date: '2026-10-14',
      },
    });
    if (res.data?.id) {
      state.payRecordId = res.data.id;
    }
    return res;
  }, stats);

  await runTest('workers_record_payment', 'workers', async () => {
    return request('POST', `/api/v1/workers/payments/${state.payRecordId}/record-payment/`, {
      headers: authHeaderA(),
      body: { amount: 150.0 },
    });
  }, stats);

  await runTest('workers_mark_paid', 'workers', async () => {
    return request('PUT', `/api/v1/workers/payments/${state.payRecordId}/mark-paid/`, {
      headers: authHeaderA(),
    });
  }, stats);

  // ==========================================
  // MODULE 5: BILLS
  // ==========================================
  console.log('\n--- Module: Bills ---');
  await runTest('bills_list_all', 'bills', async () => {
    const res = await request('GET', '/api/v1/bills/', {
      headers: authHeaderA(),
    });
    if (Array.isArray(res.data)) {
      const kacha = res.data.find(b => b.bill_type === 'kacha');
      const pakka = res.data.find(b => b.bill_type === 'pakka');
      if (kacha) state.kachaBillId = kacha.id;
      if (pakka) state.pakkaBillId = pakka.id;
    }
    return res;
  }, stats);

  await runTest('bills_list_filter_kacha', 'bills', async () => {
    return request('GET', '/api/v1/bills/?type=kacha', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('bills_list_filter_pakka', 'bills', async () => {
    return request('GET', '/api/v1/bills/?type=pakka', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('bills_list_kacha', 'bills', async () => {
    return request('GET', '/api/v1/bills/kacha/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('bills_list_pakka', 'bills', async () => {
    return request('GET', '/api/v1/bills/pakka/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('bills_detail', 'bills', async () => {
    return request('GET', `/api/v1/bills/${state.kachaBillId}/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('bills_create_kacha', 'bills', async () => {
    const res = await request('POST', '/api/v1/bills/kacha/', {
      headers: authHeaderA(),
      body: {
        buyer: { name: 'Local Trader', address: 'Bazaar Line', phone: '9812345678' },
        products: [{
          name: 'Finished Desk',
          quantity: 1.0,
          rate: 5200.0,
          unit: 'pcs',
          inventory_item_id: state.finishedItemId,
        }],
        discount: 200.0,
      },
    });
    if (res.data?.id) {
      state.tempBillId = res.data.id;
    }
    return res;
  }, stats);

  await runTest('bills_convert_kacha', 'bills', async () => {
    return request('POST', `/api/v1/bills/${state.tempBillId}/convert/`, {
      headers: authHeaderA(),
      body: {
        gst_number: '27AAAAA1234A1Z1',
        gst_percentage: 18.0,
      },
    });
  }, stats);

  await runTest('bills_record_payment', 'bills', async () => {
    return request('POST', `/api/v1/bills/${state.kachaBillId}/record-payment/`, {
      headers: authHeaderA(),
      body: { amount: 2000.0, notes: 'Direct bank transfer' },
    });
  }, stats);

  await runTest('bills_profit_preview', 'bills', async () => {
    return request('GET', `/api/v1/bills/${state.kachaBillId}/profit-preview/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('bills_confirm_profit', 'bills', async () => {
    return request('POST', `/api/v1/bills/${state.kachaBillId}/confirm-profit/`, {
      headers: authHeaderA(),
      body: { confirmed_amount: 1400.0 },
    });
  }, stats);

  await runTest('bills_reopen_profit', 'bills', async () => {
    return request('POST', `/api/v1/bills/${state.kachaBillId}/reopen-profit/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('bills_transportation_cost', 'bills', async () => {
    return request('POST', `/api/v1/bills/${state.kachaBillId}/transportation-cost/`, {
      headers: authHeaderA(),
      body: { amount: 450.0, notes: 'Express cargo dispatch' },
    });
  }, stats);

  await runTest('bills_misc_cost', 'bills', async () => {
    return request('POST', `/api/v1/bills/${state.kachaBillId}/misc-cost/`, {
      headers: authHeaderA(),
      body: { amount: 150.0, notes: 'Foam protection packaging' },
    });
  }, stats);

  await runTest('bills_ready_to_deliver', 'bills', async () => {
    return request('POST', `/api/v1/bills/${state.kachaBillId}/ready-to-deliver/`, {
      headers: authHeaderA(),
      body: {
        inventory_item_id: state.finishedItemId,
        quantity: 1.0,
        notes: 'Ready for loading',
      },
    });
  }, stats);

  await runTest('bills_confirm_shipment', 'bills', async () => {
    return request('POST', `/api/v1/bills/${state.kachaBillId}/confirm-shipment/`, {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('bills_delete', 'bills', async () => {
    return request('DELETE', `/api/v1/bills/${state.tempBillId}/`, {
      headers: authHeaderA(),
    });
  }, stats);

  // ==========================================
  // MODULE 6: DASHBOARD
  // ==========================================
  console.log('\n--- Module: Dashboard ---');
  await runTest('dashboard_summary', 'dashboard', async () => {
    return request('GET', '/api/v1/dashboard/summary/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('dashboard_rev_exp', 'dashboard', async () => {
    return request('GET', '/api/v1/dashboard/rev-exp/?months=6', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('dashboard_profit_trends', 'dashboard', async () => {
    return request('GET', '/api/v1/dashboard/profit-trends/?months=6&interval=monthly', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('dashboard_workers', 'dashboard', async () => {
    return request('GET', '/api/v1/dashboard/workers/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('dashboard_top_workers', 'dashboard', async () => {
    return request('GET', '/api/v1/dashboard/top-workers/', {
      headers: authHeaderA(),
    });
  }, stats);

  // ==========================================
  // MODULE 7: INSIGHTS
  // ==========================================
  console.log('\n--- Module: Insights ---');
  await runTest('insights_list', 'insights', async () => {
    const res = await request('GET', '/api/v1/insights/', {
      headers: authHeaderA(),
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      state.insightId = res.data[0].id;
    }
    return res;
  }, stats);

  await runTest('insights_analyze', 'insights', async () => {
    return request('POST', '/api/v1/insights/analyze/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('insights_export', 'insights', async () => {
    return request('GET', `/api/v1/insights/${state.insightId}/export/`, {
      headers: authHeaderA(),
    });
  }, stats);

  // ==========================================
  // MODULE 8: UPLOAD
  // ==========================================
  console.log('\n--- Module: Upload ---');
  await runTest('upload_manual', 'upload', async () => {
    return request('POST', '/api/v1/upload/manual/', {
      headers: authHeaderA(),
      body: {
        date: '2026-10-14',
        product: 'Finished Desk',
        category: 'Furniture',
        quantity: 4,
        production_cost: 3000.0,
        selling_price: 5200.0,
        region: 'North',
        customer_type: 'Wholesale',
      },
    });
  }, stats);

  // ==========================================
  // MODULE 9: AI ASSISTANT
  // ==========================================
  console.log('\n--- Module: AI Assistant ---');
  await runTest('ai_config', 'ai', async () => {
    return request('GET', '/api/v1/ai/config/', {
      headers: authHeaderA(),
    });
  }, stats);

  await runTest('ai_command', 'ai', async () => {
    return request('POST', '/api/v1/ai/command/', {
      headers: authHeaderA(),
      body: {
        command: 'show monthly summary',
      },
    });
  }, stats);

  // ==========================================
  // MODULE 10: TENANCY ISOLATION (SECURITY)
  // ==========================================
  console.log('\n--- Module: Tenancy Isolation ---');
  await runTest('tenancy_bill_cross_tenant_forbidden', 'tenancy', async () => {
    return request('GET', `/api/v1/bills/${state.kachaBillId}/`, {
      headers: authHeaderB(),
    });
  }, stats);

  await runTest('tenancy_worker_cross_tenant_forbidden', 'tenancy', async () => {
    return request('GET', `/api/v1/workers/${state.workerId}/`, {
      headers: authHeaderB(),
    });
  }, stats);

  await runTest('tenancy_inventory_cross_tenant_forbidden', 'tenancy', async () => {
    return request('PUT', `/api/v1/inventory/finished/${state.finishedItemId}/`, {
      headers: authHeaderB(),
      body: { name: 'Tampered Desk' },
    });
  }, stats);

  await runTest('tenancy_warehouse_cross_tenant_forbidden', 'tenancy', async () => {
    return request('PUT', `/api/v1/inventory/warehouses/${state.warehouseId}/`, {
      headers: authHeaderB(),
      body: { name: 'Tampered Warehouse' },
    });
  }, stats);

  // ==========================================
  // MODULE 11: CONTACT
  // ==========================================
  console.log('\n--- Module: Contact ---');
  await runTest('contact_get_method_not_allowed', 'contact', async () => {
    return request('GET', '/contact');
  }, stats);

  await runTest('contact_submit', 'contact', async () => {
    return request('POST', '/contact', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=Test&email=test@example.com&message=Hello',
    });
  }, stats);

  // ==========================================
  // SUMMARY SCOREBOARD
  // ==========================================
  stats.total = stats.recorded + stats.passed + stats.failed;
  console.log('\n=======================================================');
  console.log('CONTRACT SUITE EXECUTION SUMMARY');
  console.log('=======================================================');
  console.log(`Total tests executed: ${stats.total}`);
  if (MODE === 'record') {
    console.log(`Fixtures recorded:    ${stats.recorded}`);
  } else {
    console.log(`Passed:               ${stats.passed}`);
  }
  console.log(`Failed:               ${stats.failed}`);
  console.log(`Skipped:              ${stats.skipped}`);

  if (stats.failed > 0) {
    console.log('\nFailures:');
    for (const f of stats.errors) {
      console.log(`  - [${f.moduleName}] ${f.testName}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\nALL CONTRACT TESTS COMPLETED SUCCESSFULLY.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('FATAL CONTRACT RUNNER ERROR:', err);
  process.exit(1);
});
