import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// 1. Reseed DB cleanly
console.log('Reseeding test database...');
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

// 2. Log in to both backends
console.log('Logging in to Django and Node backends...');
const nodeLoginRes = await fetch('http://127.0.0.1:4000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'alice@company-a.com', password: 'password123' }),
});
const nodeLogin = await nodeLoginRes.json();
const nodeToken = nodeLogin.tokens.access;

const djangoLoginRes = await fetch('http://127.0.0.1:8000/api/v1/auth/login/', {
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

console.log('Fetching and comparing dashboard numbers between Django and Node...');
let mismatches = 0;
const report = [];

report.push('================================================================');
report.push('D4: DASHBOARD RENDER NUMERIC PARITY VERIFICATION REPORT');
report.push('================================================================');
report.push(`Node Target:   http://127.0.0.1:4000/api/v1`);
report.push(`Django Target: http://127.0.0.1:8000/api/v1`);
report.push(`Seeded User:   alice@company-a.com`);
report.push('----------------------------------------------------------------\n');

for (const ep of endpoints) {
  const nodeUrl = `http://127.0.0.1:4000/api/v1${ep}`;
  const djangoUrl = `http://127.0.0.1:8000/api/v1${ep}/`;

  const [nodeRes, djangoRes] = await Promise.all([
    fetch(nodeUrl, { headers: { Authorization: `Bearer ${nodeToken}` } }),
    fetch(djangoUrl, { headers: { Authorization: `Bearer ${djangoToken}` } }),
  ]);

  const nodeData = await nodeRes.json();
  const djangoData = await djangoRes.json();

  report.push(`Endpoint: ${ep}`);
  report.push(`Node Status:   ${nodeRes.status}`);
  report.push(`Django Status: ${djangoRes.status}`);

  // Deep numeric comparison
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

  const nodeNums = extractNumbers(nodeData);
  const djangoNums = extractNumbers(djangoData);

  const allKeys = Array.from(new Set([...Object.keys(nodeNums), ...Object.keys(djangoNums)])).sort();
  let epMismatches = 0;

  for (const key of allKeys) {
    const nVal = nodeNums[key];
    const dVal = djangoNums[key];

    // Allow float epsilon 0.001
    const match = nVal !== undefined && dVal !== undefined && Math.abs(nVal - dVal) < 0.001;
    if (!match) {
      epMismatches++;
      mismatches++;
      report.push(`  [MISMATCH] ${key}: Node=${nVal} vs Django=${dVal}`);
    } else {
      report.push(`  [MATCH]    ${key}: ${nVal}`);
    }
  }

  report.push(`Endpoint Summary: ${allKeys.length} metrics checked, ${epMismatches} mismatches\n`);
}

report.push('----------------------------------------------------------------');
report.push(`FINAL RESULT: ${mismatches === 0 ? 'PERFECT NUMERIC PARITY (0 mismatches)' : `FAILED with ${mismatches} mismatches`}`);
report.push('================================================================');

const fullReportText = report.join('\n');
console.log(fullReportText);

import fs from 'node:fs';
fs.writeFileSync(path.resolve(ROOT, 'docs/migration/evidence/D4_dashboard_parity.txt'), fullReportText, 'utf-8');
console.log('Saved report to docs/migration/evidence/D4_dashboard_parity.txt');

if (mismatches > 0) {
  process.exit(1);
}
