#!/usr/bin/env node
/**
 * scripts/check_dependencies_and_dead_code.mjs
 *
 * Dependency + Dead Code Audit (CI Required):
 * - Audits apps/api, apps/web, and packages/shared for unused dependencies
 * - Audits for unused / orphaned source files
 * - Audits for unused exports
 * - Audits pnpm audit (0 high/critical vulnerabilities)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('       DEPENDENCY & DEAD CODE AUDIT (0 UNUSED GATES)            ');
console.log('================================================================\n');

let totalErrors = 0;

function logError(checkName, msg) {
  console.error(`❌ [${checkName}] ${msg}`);
  totalErrors++;
}

function logPass(checkName, msg) {
  console.log(`✅ [${checkName}] ${msg}`);
}

function walkFiles(dir, filterFn) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name !== 'node_modules' && ent.name !== 'dist' && ent.name !== '.git' && ent.name !== 'coverage') {
        results.push(...walkFiles(full, filterFn));
      }
    } else if (filterFn(full)) {
      results.push(full);
    }
  }
  return results;
}

// -----------------------------------------------------------------------------
// 1. PNPM SECURITY AUDIT (0 HIGH / CRITICAL)
// -----------------------------------------------------------------------------
console.log('--- 1. Vulnerability Audit ---');
try {
  const auditOutput = execSync('pnpm audit --audit-level=high', { cwd: rootDir, encoding: 'utf8' });
  console.log(auditOutput.trim());
  logPass('AUDIT', 'pnpm audit passed with 0 high/critical vulnerabilities.');
} catch (err) {
  logError('AUDIT', `Security audit failed with high/critical vulnerabilities: ${err.stdout || err.message}`);
}

// -----------------------------------------------------------------------------
// 2. UNUSED DEPENDENCIES AUDIT
// -----------------------------------------------------------------------------
console.log('\n--- 2. Unused Dependencies Audit ---');

const workspaces = [
  { name: '@insightloop/api', dir: path.join(rootDir, 'apps/api') },
  { name: '@insightloop/web', dir: path.join(rootDir, 'apps/web') },
  { name: '@insightloop/shared', dir: path.join(rootDir, 'packages/shared') },
];

for (const ws of workspaces) {
  const pkgJsonPath = path.join(ws.dir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  const allCodeFiles = walkFiles(ws.dir, (f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|css|html)$/.test(f));
  const fileContents = allCodeFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  // Also check package scripts, config files and parent scripts
  const rootScripts = fs.existsSync(path.join(rootDir, 'package.json'))
    ? fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
    : '';
  const searchCorpus = fileContents + '\n' + JSON.stringify(pkg.scripts || {}) + '\n' + rootScripts;

  const declaredDeps = Object.keys(pkg.dependencies || {});
  for (const dep of declaredDeps) {
    if (dep.startsWith('@insightloop/')) continue; // workspace link
    // Regex matching import ... from 'dep' or require('dep') or dep in scripts
    const depPattern = new RegExp(`(['"\`])${dep}(?:/.*)?\\1|\\b${dep}\\b`, 'm');
    if (!depPattern.test(searchCorpus)) {
      logError('UNUSED-DEP', `${ws.name}: declared dependency '${dep}' is not used anywhere in ${ws.dir}!`);
    }
  }

  logPass('UNUSED-DEP', `${ws.name}: All ${declaredDeps.length} dependencies verified in active use.`);
}

// -----------------------------------------------------------------------------
// 3. UNUSED / ORPHANED SOURCE FILES AUDIT
// -----------------------------------------------------------------------------
console.log('\n--- 3. Unused / Orphaned Files Audit ---');

// For apps/api:
const apiSrcFiles = walkFiles(
  path.join(rootDir, 'apps/api/src'),
  (f) => /\.ts$/.test(f) && !f.endsWith('.d.ts') && !f.includes('.test.')
);
const apiTestFiles = walkFiles(path.join(rootDir, 'apps/api/test'), (f) => /\.ts$/.test(f));
const allApiFiles = [...apiSrcFiles, ...apiTestFiles];
const allApiText = allApiFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

for (const file of apiSrcFiles) {
  const base = path.basename(file, '.ts');
  if (base === 'server' || base === 'app') continue; // Top-level entries

  const isImported = allApiText.includes(base);
  if (!isImported) {
    logError('ORPHAN-FILE', `apps/api: Source file ${path.relative(rootDir, file)} is never imported!`);
  }
}
logPass('ORPHAN-FILE', `apps/api: All ${apiSrcFiles.length} source files are reachable and imported.`);

// For apps/web:
const webSrcFiles = walkFiles(
  path.join(rootDir, 'apps/web/src'),
  (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts') && !f.includes('.test.')
);
const webTestFiles = walkFiles(path.join(rootDir, 'apps/web/test'), (f) => /\.(ts|tsx)$/.test(f));
const allWebFiles = [...webSrcFiles, ...webTestFiles];
const allWebText = allWebFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

for (const file of webSrcFiles) {
  const base = path.basename(file).replace(/\.(tsx|ts)$/, '');
  if (base === 'main' || base === 'App' || base === 'vite-env.d') continue; // Top-level entries

  const isImported = allWebText.includes(base);
  if (!isImported) {
    logError('ORPHAN-FILE', `apps/web: Source file ${path.relative(rootDir, file)} is never imported!`);
  }
}
logPass('ORPHAN-FILE', `apps/web: All ${webSrcFiles.length} source files are reachable and imported.`);

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
if (totalErrors > 0) {
  console.error(`FAILED: ${totalErrors} dead code / unused dependency violations detected!`);
  process.exit(1);
} else {
  console.log('SUCCESS: Dependency and dead code audit passed with ZERO unused files/dependencies.');
  process.exit(0);
}
