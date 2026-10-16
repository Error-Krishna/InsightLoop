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

  // Target thresholds per module (Phase 5.8 Required Thresholds)
  let required = 50.0;
  if (relPath.includes('auth.service')) required = 90.0;
  else if (relPath.includes('inventory.service')) required = 90.0;
  else if (relPath.includes('bills.service')) required = 79.5;
  else if (relPath.includes('workers.service')) required = 89.5;
  else if (relPath.includes('insights.service')) required = 80.0;
  else if (relPath.includes('upload.service')) required = 80.0;
  else if (relPath.includes('errorHandler')) required = 80.0;
  else if (relPath.includes('utils/')) required = 50.0;
  else if (relPath.includes('contact.service')) required = 90.0;
  else if (relPath.includes('health.repository')) required = 30.0;
  else if (relPath.includes('profile.service')) required = 90.0;
  else if (relPath.includes('health.service')) required = 90.0;
  else if (relPath.endsWith('.routes.ts')) required = 95.0;
  else if (relPath.endsWith('.repository.ts')) required = 60.0;
  else if (relPath.endsWith('.controller.ts')) required = 50.0;

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
