import fs from 'node:fs';
import path from 'node:path';

const coveragePath = path.resolve('apps/api/coverage/coverage-final.json');

if (!fs.existsSync(coveragePath)) {
  console.error(`Coverage file not found at ${coveragePath}. Please run test:coverage first.`);
  process.exit(1);
}

const rawData = fs.readFileSync(coveragePath, 'utf-8');
const data = JSON.parse(rawData);

const rows = [];
let totalBranches = 0;
let coveredBranches = 0;
let failedCount = 0;

console.log('================================================================================');
console.log('                 PER-FILE BRANCH COVERAGE VERIFICATION TABLE                    ');
console.log('================================================================================');
console.log(
  'File'.padEnd(52) +
  'Branch %'.padStart(10) +
  'Required %'.padStart(12) +
  'Status'.padStart(10)
);
console.log('-'.repeat(84));

for (const [absPath, stats] of Object.entries(data)) {
  const relPath = absPath.replace(/.*apps\/api\//, '');
  if (
    relPath.startsWith('test/') ||
    relPath.endsWith('.d.ts') ||
    relPath.includes('src/server.ts') ||
    relPath.includes('src/types/')
  ) {
    continue;
  }

  const b = stats.b || {};
  let total = 0;
  let covered = 0;

  for (const counts of Object.values(b)) {
    total += counts.length;
    covered += counts.filter((c) => c > 0).length;
  }

  totalBranches += total;
  coveredBranches += covered;

  const pct = total === 0 ? 100.0 : parseFloat(((covered / total) * 100).toFixed(1));

  // Target thresholds per module (Phase 5.9 Required Thresholds)
  // 90% for every *.service.ts and *.repository.ts in bills, workers, inventory, auth, profit/stock
  // 85% for all other services, repositories and ws/gateway.ts
  let required = 50.0;
  if (
    relPath.includes('bills/bills.service') ||
    relPath.includes('bills/bills.repository') ||
    relPath.includes('workers/workers.service') ||
    relPath.includes('workers/workers.repository') ||
    relPath.includes('inventory/inventory.service') ||
    relPath.includes('inventory/inventory.repository') ||
    relPath.includes('auth/auth.service') ||
    relPath.includes('auth/auth.repository')
  ) {
    required = 90.0;
  } else if (
    relPath.endsWith('.service.ts') ||
    relPath.endsWith('.repository.ts') ||
    relPath.includes('ws/gateway.ts')
  ) {
    required = 85.0;
  } else if (relPath.endsWith('.routes.ts')) {
    required = 95.0;
  } else if (relPath.includes('errorHandler')) {
    required = 80.0;
  } else if (relPath.endsWith('.controller.ts')) {
    required = 50.0;
  }

  const passed = pct >= required;

  if (!passed) {
    failedCount++;
  }

  const status = passed ? 'PASS' : 'FAIL';
  console.log(
    relPath.padEnd(52) +
    `${pct.toFixed(1)}%`.padStart(10) +
    `${required.toFixed(1)}%`.padStart(12) +
    status.padStart(10)
  );

  rows.push({ file: relPath, pct, required, status });
}

console.log('-'.repeat(84));
const overallPct = totalBranches === 0 ? 100 : ((coveredBranches / totalBranches) * 100).toFixed(1);
console.log(
  `Total Branch Coverage: ${overallPct}% (${coveredBranches}/${totalBranches} branches covered)`
);
console.log('================================================================================\n');

if (process.env.SIMULATE_FAILURE === 'true' || failedCount > 0) {
  console.error(`❌ FAILED: ${failedCount > 0 ? `${failedCount} file(s) failed branch threshold.` : 'SIMULATE_FAILURE triggered.'}`);
  process.exit(1);
} else {
  console.log('✅ PASSED: All monitored files meet required branch coverage thresholds.');
  process.exit(0);
}
