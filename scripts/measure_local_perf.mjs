#!/usr/bin/env node
/**
 * scripts/measure_local_perf.mjs
 *
 * Runs the local benchmark suite against a locally-booted Node API server.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PORT = 4006;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_NAME = 'InsightLoop_perf_bench';
const MONGO_URI = `mongodb://127.0.0.1:27017/${DB_NAME}`;

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

function stats(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const med = median(values);
  return { min: Math.round(min * 100) / 100, median: med, max: Math.round(max * 100) / 100, raw: values };
}

async function timedFetch(url, options = {}) {
  const start = performance.now();
  const res = await fetch(url, options);
  const duration = performance.now() - start;
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else if (contentType.includes('application/pdf')) {
    data = await res.arrayBuffer().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }
  return {
    status: res.status,
    durationMs: Math.round(duration * 100) / 100,
    headers: res.headers,
    data,
  };
}

async function run() {
  console.log(`Starting local production server on port ${PORT}...`);
  const serverProc = spawn('node', ['apps/api/dist/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      MONGODB_URI: MONGO_URI,
      MONGODB_DB_NAME: DB_NAME,
      JWT_SECRET: 'local-perf-jwt-secret-must-be-at-least-32-chars-long!',
      CORS_ORIGIN: 'http://localhost:5173',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      GOOGLE_CLIENT_ID: 'mock-google-client-id-for-perf-benchmark',
      METRICS_TOKEN: 'mock-metrics-token-for-perf-benchmark-32-chars',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.on('data', (d) => {
    // console.log('[SERVER]', d.toString().trim());
  });
  serverProc.stderr.on('data', (d) => {
    // console.error('[SERVER ERR]', d.toString().trim());
  });

  // Wait for server ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // wait
    }
  }

  if (!ready) {
    serverProc.kill();
    throw new Error('Local server failed to start within 6 seconds.');
  }

  console.log('Local server ready. Starting benchmark...\n');
  const results = {};

  // 1. /health (10x)
  const healthTimes = [];
  for (let i = 0; i < 10; i++) {
    const res = await timedFetch(`${BASE_URL}/health`);
    healthTimes.push(res.durationMs);
  }
  results['health'] = stats(healthTimes);

  // 2. Signup (10x)
  const signupTimes = [];
  const throwawayUsers = [];
  for (let i = 0; i < 10; i++) {
    const suffix = crypto.randomBytes(4).toString('hex');
    const email = `local_perf_${Date.now()}_${suffix}@perf.local`;
    const password = `PerfP@ss_${suffix}!123`;
    const company = `Local Perf Corp ${suffix}`;
    const res = await timedFetch(`${BASE_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Local Tester ${i}`, email, password, company_name: company }),
    });
    if (res.status === 201) {
      signupTimes.push(res.durationMs);
      throwawayUsers.push({ email, password, tokens: res.data?.tokens, user: res.data?.user });
    }
  }
  results['signup'] = stats(signupTimes);

  // 3. Login (10x)
  const primaryUser = throwawayUsers[0];
  const loginTimes = [];
  let token = primaryUser.tokens.access;
  for (let i = 0; i < 10; i++) {
    const res = await timedFetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: primaryUser.email, password: primaryUser.password }),
    });
    if (res.status === 200) {
      loginTimes.push(res.durationMs);
      token = res.data?.tokens?.access || token;
    }
  }
  results['login'] = stats(loginTimes);

  const authHeader = { Authorization: `Bearer ${token}` };

  // Setup seed entities
  const workerRes = await timedFetch(`${BASE_URL}/api/v1/workers`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Perf Worker', age: 30, phone: '9988776655', address: 'Test Lane' }),
  });
  const workerId = workerRes.data?.id;

  const invRes = await timedFetch(`${BASE_URL}/api/v1/inventory/finished`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Perf Widget', unit: 'pcs', selling_price: 200, cost_price: 100, quantity: 50, reorder_level: 10 }),
  });
  const inventoryId = invRes.data?.id;

  const billRes = await timedFetch(`${BASE_URL}/api/v1/bills`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bill_type: 'kacha',
      buyer_name: 'Perf Buyer',
      buyer_phone: '9876543210',
      products: [{ name: 'Perf Widget', quantity: 2, rate: 200, unit: 'pcs' }],
      payments: [{ amount: 200, notes: 'Advance' }],
    }),
  });
  const billId = billRes.data?.id;

  // 4. Dashboard Overview (10x)
  const overviewTimes = [];
  for (let i = 0; i < 10; i++) {
    const res = await timedFetch(`${BASE_URL}/api/v1/dashboard/overview`, { headers: authHeader });
    if (res.status === 200) overviewTimes.push(res.durationMs);
  }
  results['dashboard_overview'] = stats(overviewTimes);

  // 5. Bills list (10x)
  const billsTimes = [];
  for (let i = 0; i < 10; i++) {
    const res = await timedFetch(`${BASE_URL}/api/v1/bills`, { headers: authHeader });
    if (res.status === 200) billsTimes.push(res.durationMs);
  }
  results['bills_list'] = stats(billsTimes);

  // 6. Workers list (10x)
  const workersTimes = [];
  for (let i = 0; i < 10; i++) {
    const res = await timedFetch(`${BASE_URL}/api/v1/workers`, { headers: authHeader });
    if (res.status === 200) workersTimes.push(res.durationMs);
  }
  results['workers_list'] = stats(workersTimes);

  // 7. Inventory list (10x)
  const inventoryTimes = [];
  for (let i = 0; i < 10; i++) {
    const res = await timedFetch(`${BASE_URL}/api/v1/inventory/finished`, { headers: authHeader });
    if (res.status === 200) inventoryTimes.push(res.durationMs);
  }
  results['inventory_list'] = stats(inventoryTimes);

  // 8. Insights list (10x)
  const insightsTimes = [];
  for (let i = 0; i < 10; i++) {
    const res = await timedFetch(`${BASE_URL}/api/v1/insights`, { headers: authHeader });
    if (res.status === 200) insightsTimes.push(res.durationMs);
  }
  results['insights_list'] = stats(insightsTimes);

  // 9. Bill PDF (10x)
  const pdfTimes = [];
  for (let i = 0; i < 10; i++) {
    const res = await timedFetch(`${BASE_URL}/api/v1/bills/${billId}/pdf`, { headers: authHeader });
    if (res.status === 200) pdfTimes.push(res.durationMs);
  }
  results['bill_pdf'] = stats(pdfTimes);

  // Shutdown server
  serverProc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));

  console.log('Endpoint                       Min (ms)    Median (ms)    Max (ms)');
  console.log('------------------------------------------------------------------');
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k.padEnd(30)} ${String(v.min).padStart(8)}    ${String(v.median).padStart(11)}    ${String(v.max).padStart(8)}`);
  }
  return results;
}

run().catch((e) => {
  console.error('Error running local benchmark:', e);
  process.exit(1);
});
