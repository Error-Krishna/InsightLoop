#!/usr/bin/env node
/**
 * scripts/test_timezone_dual_parity.mjs
 *
 * Verifies numeric and boundary parity across Django and Node under:
 * 1. Process timezone forced to UTC (TZ=UTC, APP_TIME_ZONE=UTC)
 * 2. Process timezone forced to Asia/Kolkata (TZ=Asia/Kolkata, APP_TIME_ZONE=Asia/Kolkata)
 * 3. Boundary records placed 1 second before/after midnight UTC and month end
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from '../apps/api/node_modules/mongodb/lib/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MONGO_URI = 'mongodb://localhost:27017/InsightLoop_test';
const DB_NAME = 'InsightLoop_test';
const DJANGO_PORT = 8000;
const NODE_PORT = 4000;
const DJANGO_URL = `http://127.0.0.1:${DJANGO_PORT}`;
const NODE_URL = `http://127.0.0.1:${NODE_PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reseedDb() {
  execSync(
    'MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" PYTHONPATH="insightloop" .venv/bin/python scripts/seed_test_db.py',
    { cwd: ROOT, stdio: 'pipe' }
  );
}

function extractNumbers(obj, prefix = '') {
  const nums = {};
  if (obj === null || obj === undefined) return nums;
  if (typeof obj === 'number') {
    nums[prefix] = obj;
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      Object.assign(nums, extractNumbers(item, `${prefix}[${idx}]`));
    });
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      Object.assign(nums, extractNumbers(value, nextPrefix));
    }
  }
  return nums;
}

async function startServers(tz, appTimeZone) {
  console.log(`\n--- Starting servers with TZ=${tz}, APP_TIME_ZONE=${appTimeZone} ---`);
  const envBase = {
    ...process.env,
    TZ: tz,
    APP_TIME_ZONE: appTimeZone,
    MONGODB_URI: MONGO_URI,
    MONGODB_DB_NAME: DB_NAME,
    DJANGO_SECRET_KEY: 'test-secret-key-must-be-long-enough-32-chars',
    JWT_SECRET: 'test-secret-key-must-be-long-enough-32-chars',
  };

  const djangoProc = spawn(
    '.venv/bin/python',
    ['-m', 'daphne', '-b', '127.0.0.1', '-p', String(DJANGO_PORT), 'insightloop.asgi:application'],
    {
      cwd: ROOT,
      env: {
        ...envBase,
        DJANGO_DEBUG: 'true',
        PYTHONPATH: 'insightloop',
      },
      stdio: 'ignore',
    }
  );

  const nodeProc = spawn('node', ['apps/api/dist/server.js'], {
    cwd: ROOT,
    env: {
      ...envBase,
      NODE_ENV: 'test',
      PORT: String(NODE_PORT),
      HOST: '127.0.0.1',
    },
    stdio: 'ignore',
  });

  // Wait for both to be ready
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    let dOk = false;
    let nOk = false;
    try {
      const r = await fetch(`${DJANGO_URL}/`);
      if (r.status === 200) dOk = true;
    } catch {}
    try {
      const r = await fetch(`${NODE_URL}/health`);
      if (r.status === 200) nOk = true;
    } catch {}
    if (dOk && nOk) {
      return { djangoProc, nodeProc };
    }
  }

  djangoProc.kill('SIGKILL');
  nodeProc.kill('SIGKILL');
  throw new Error(`Servers failed to start for TZ=${tz}`);
}

async function runParityChecks(report, tzLabel) {
  report.push(`\n================================================================`);
  report.push(`TIMEZONE PARITY TEST RUN: ${tzLabel}`);
  report.push(`================================================================`);

  // Login
  const nodeLoginRes = await fetch(`${NODE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@company-a.com', password: 'password123' }),
  });
  const nodeLogin = await nodeLoginRes.json();
  const nodeToken = nodeLogin.tokens.access;

  const djangoLoginRes = await fetch(`${DJANGO_URL}/api/v1/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@company-a.com', password: 'password123' }),
  });
  const djangoLogin = await djangoLoginRes.json();
  const djangoToken = djangoLogin.tokens.access;

  const endpoints = [
    '/dashboard/summary',
    '/dashboard/rev-exp',
    '/dashboard/profit-trends',
    '/dashboard/workers',
    '/dashboard/top-workers',
  ];

  let totalMismatches = 0;

  for (const ep of endpoints) {
    const nodeRes = await fetch(`${NODE_URL}/api/v1${ep}`, {
      headers: { Authorization: `Bearer ${nodeToken}` },
    });
    const djangoRes = await fetch(`${DJANGO_URL}/api/v1${ep}/`, {
      headers: { Authorization: `Bearer ${djangoToken}` },
    });

    const nodeData = await nodeRes.json();
    const djangoData = await djangoRes.json();

    const nodeNums = extractNumbers(nodeData);
    const djangoNums = extractNumbers(djangoData);
    const allKeys = Array.from(new Set([...Object.keys(nodeNums), ...Object.keys(djangoNums)])).sort();

    let epMismatches = 0;
    for (const key of allKeys) {
      const nVal = nodeNums[key];
      const dVal = djangoNums[key];
      const match = nVal !== undefined && dVal !== undefined && Math.abs(nVal - dVal) < 0.001;
      if (!match) {
        epMismatches++;
        totalMismatches++;
        report.push(`  [MISMATCH] ${ep} -> ${key}: Node=${nVal} vs Django=${dVal}`);
      }
    }

    report.push(`  ✓ ${ep}: ${allKeys.length} numeric metrics evaluated, ${epMismatches} mismatches`);
  }

  report.push(`Result for ${tzLabel}: ${totalMismatches === 0 ? 'PASS (0 mismatches)' : `FAIL (${totalMismatches} mismatches)`}`);
  return totalMismatches;
}

async function testMidnightBoundaryRecords(report) {
  report.push(`\n================================================================`);
  report.push(`MIDNIGHT UTC & MONTH-END BOUNDARY VERIFICATION`);
  report.push(`================================================================`);

  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db(DB_NAME);

  const companyAId = 'b8678e92-7101-454a-b0a6-8dd89a978b3a';
  // Insert two records: one at Oct 31 23:59:59 UTC, one at Nov 1 00:00:01 UTC
  const preMidnight = new Date('2026-10-31T23:59:59.000Z');
  const postMidnight = new Date('2026-11-01T00:00:01.000Z');

  await db.collection('business_data').insertMany([
    {
      company_id: companyAId,
      date: preMidnight,
      product: 'Boundary Pre-Midnight Oct 31',
      category: 'Boundary',
      quantity: 10,
      production_cost: 100,
      selling_price: 250,
      region: 'North',
      customer_type: 'Wholesale',
    },
    {
      company_id: companyAId,
      date: postMidnight,
      product: 'Boundary Post-Midnight Nov 1',
      category: 'Boundary',
      quantity: 5,
      production_cost: 50,
      selling_price: 150,
      region: 'North',
      customer_type: 'Wholesale',
    },
  ]);

  // Login
  const nodeLoginRes = await fetch(`${NODE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@company-a.com', password: 'password123' }),
  });
  const nodeToken = (await nodeLoginRes.json()).tokens.access;

  const djangoLoginRes = await fetch(`${DJANGO_URL}/api/v1/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@company-a.com', password: 'password123' }),
  });
  const djangoToken = (await djangoLoginRes.json()).tokens.access;

  // Query /dashboard/rev-exp?months=6 on both
  const [nodeRevRes, djangoRevRes] = await Promise.all([
    fetch(`${NODE_URL}/api/v1/dashboard/rev-exp?months=6`, {
      headers: { Authorization: `Bearer ${nodeToken}` },
    }),
    fetch(`${DJANGO_URL}/api/v1/dashboard/rev-exp/?months=6`, {
      headers: { Authorization: `Bearer ${djangoToken}` },
    }),
  ]);

  const nodeRev = await nodeRevRes.json();
  const djangoRev = await djangoRevRes.json();

  const nodeNums = extractNumbers(nodeRev);
  const djangoNums = extractNumbers(djangoRev);
  const allKeys = Array.from(new Set([...Object.keys(nodeNums), ...Object.keys(djangoNums)])).sort();

  let mismatches = 0;
  for (const key of allKeys) {
    const nVal = nodeNums[key];
    const dVal = djangoNums[key];
    if (Math.abs(nVal - dVal) > 0.001) {
      mismatches++;
      report.push(`  [MISMATCH] rev-exp boundary ${key}: Node=${nVal} vs Django=${dVal}`);
    }
  }

  report.push(`Boundary rev-exp result: ${mismatches === 0 ? 'PERFECT MATCH (0 mismatches across month boundary)' : `FAIL (${mismatches} mismatches)`}`);

  await client.close();
  return mismatches;
}

async function main() {
  const report = [];
  report.push('================================================================');
  report.push('INSIGHTLOOP DUAL-STACK TIMEZONE PARITY SUITE (PHASE 5.11)');
  report.push('================================================================');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Mongo Target: ${MONGO_URI}`);

  let overallMismatches = 0;

  // 1. Run under UTC
  reseedDb();
  let servers = await startServers('UTC', 'UTC');
  try {
    const utcMismatches = await runParityChecks(report, 'TZ=UTC / APP_TIME_ZONE=UTC (Render Production Baseline)');
    const boundaryMismatches = await testMidnightBoundaryRecords(report);
    overallMismatches += utcMismatches + boundaryMismatches;
  } finally {
    servers.djangoProc.kill('SIGTERM');
    servers.nodeProc.kill('SIGTERM');
    await sleep(500);
  }

  // 2. Run under Asia/Kolkata
  reseedDb();
  servers = await startServers('Asia/Kolkata', 'Asia/Kolkata');
  try {
    const istMismatches = await runParityChecks(report, 'TZ=Asia/Kolkata / APP_TIME_ZONE=Asia/Kolkata');
    overallMismatches += istMismatches;
  } finally {
    servers.djangoProc.kill('SIGTERM');
    servers.nodeProc.kill('SIGTERM');
    await sleep(500);
  }

  // 3. Vitest B3 timezone tests
  report.push(`\n================================================================`);
  report.push(`VITEST B3 TIMEZONE & BOUNDARY UNIT/INTEGRATION TEST SUITE`);
  report.push(`================================================================`);
  const vitestOutput = execSync('pnpm --filter @insightloop/api test test/b3_timezone.test.ts', {
    cwd: ROOT,
    encoding: 'utf-8',
  });
  report.push(vitestOutput.trim());

  report.push(`\n----------------------------------------------------------------`);
  report.push(`OVERALL TIMEZONE PARITY VERIFICATION RESULT: ${overallMismatches === 0 ? 'ALL PARITY CHECKS PASSED (0 MISMATCHES)' : `FAILED with ${overallMismatches} mismatches`}`);
  report.push('================================================================');

  const fullReport = report.join('\n');
  console.log(fullReport);

  const evidencePath = path.resolve(ROOT, 'docs/migration/evidence/timezone_parity.txt');
  fs.writeFileSync(evidencePath, fullReport, 'utf-8');
  console.log(`\nSaved evidence to ${evidencePath}`);

  if (overallMismatches > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during timezone parity testing:', err);
  process.exit(1);
});
