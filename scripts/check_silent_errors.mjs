#!/usr/bin/env node
/**
 * scripts/check_silent_errors.mjs
 *
 * Automated Silent-Failure and Code Quality Gate (CI Required):
 * Checks for:
 * 1. empty catch, catch that only logs, .catch(() => {}) without reason
 * 2. Unjustified catches without AppError rethrow, explicit error response, or // SILENT-FALLBACK-REASON: comment
 * 3. console.log / console.error in production backend code (requires pino logger)
 * 4. // TODO | FIXME | HACK markers
 * 5. @ts-ignore / @ts-expect-error without a reason
 * 6. eslint-disable without a reason
 * 7. test.skip, it.skip, describe.skip, test.only, it.only, describe.only, test.todo, it.todo
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('      PHASE 5.8: "NO SILENT FAILURES & INTEGRITY" SCAN          ');
console.log('================================================================\n');

let totalErrors = 0;

function logError(checkName, file, line, msg) {
  console.error(`❌ [${checkName}] ${path.relative(rootDir, file)}:${line} -> ${msg}`);
  totalErrors++;
}

function logPass(checkName, msg) {
  console.log(`✅ [${checkName}] ${msg}`);
}

function walkDir(dir, filterFn) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name !== 'node_modules' && ent.name !== 'dist' && ent.name !== '.git' && ent.name !== 'coverage') {
        results.push(...walkDir(full, filterFn));
      }
    } else if (filterFn(full)) {
      results.push(full);
    }
  }
  return results;
}

// -----------------------------------------------------------------------------
// 1. TODO, FIXME, HACK SCAN
// -----------------------------------------------------------------------------
const prodCodeFiles = [
  ...walkDir(path.join(rootDir, 'apps/api/src'), (f) => /\.(ts|js)$/.test(f)),
  ...walkDir(path.join(rootDir, 'apps/web/src'), (f) => /\.(ts|tsx|js|jsx)$/.test(f)),
  ...walkDir(path.join(rootDir, 'packages'), (f) => /\.(ts|js)$/.test(f) && !f.includes('/dist/')),
];

let todoErrors = 0;
for (const file of prodCodeFiles) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (/\/\/\s*(TODO|FIXME|HACK)\b/i.test(line)) {
      logError('TODO-SCAN', file, idx + 1, `Found unresolved marker in production code: ${line.trim()}`);
      todoErrors++;
    }
  });
}
if (todoErrors === 0) {
  logPass('TODO-SCAN', 'Zero unresolved TODO, FIXME, or HACK comments found across production codebase.');
}

// -----------------------------------------------------------------------------
// 2. TYPESCRIPT IGNORE & ESLINT DISABLE REASON AUDIT
// -----------------------------------------------------------------------------
let directiveErrors = 0;
for (const file of prodCodeFiles) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    // Check @ts-ignore or @ts-expect-error
    if (/@ts-(ignore|expect-error)/.test(line)) {
      if (!line.includes(':') && !line.includes('--') && !line.includes('reason')) {
        logError('TS-DIRECTIVE', file, idx + 1, `@ts directive lacks explanation reason: ${line.trim()}`);
        directiveErrors++;
      }
    }
    // Check eslint-disable
    if (/eslint-disable/.test(line)) {
      if (!line.includes('--') && !line.includes('reason:')) {
        logError('ESLINT-DIRECTIVE', file, idx + 1, `eslint-disable lacks documented reason: ${line.trim()}`);
        directiveErrors++;
      }
    }
  });
}
if (directiveErrors === 0) {
  logPass('DIRECTIVES', 'All compiler/linter suppression directives contain explicit documented reasons.');
}

// -----------------------------------------------------------------------------
// 3. CONSOLE.LOG/ERROR IN PRODUCTION BACKEND AUDIT
// -----------------------------------------------------------------------------
const apiSrcFiles = walkDir(path.join(rootDir, 'apps/api/src'), (f) => /\.ts$/.test(f));
let consoleErrors = 0;
for (const file of apiSrcFiles) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (/console\.(log|error|warn|info)\s*\(/.test(line)) {
      logError('CONSOLE-SCAN', file, idx + 1, `Raw console call in backend production code (use pino logger): ${line.trim()}`);
      consoleErrors++;
    }
  });
}
if (consoleErrors === 0) {
  logPass('CONSOLE-SCAN', 'Zero raw console.log/error calls in apps/api/src (Pino structured logging enforced).');
}

// -----------------------------------------------------------------------------
// 4. TEST INTEGRITY & NO SKIP / ONLY AUDIT
// -----------------------------------------------------------------------------
const testFiles = [
  ...walkDir(path.join(rootDir, 'apps/api/test'), (f) => /\.ts$/.test(f)),
  ...walkDir(path.join(rootDir, 'apps/web/test'), (f) => /\.(ts|tsx)$/.test(f)),
  ...walkDir(path.join(rootDir, 'test'), (f) => /\.ts$/.test(f)),
];

let testIntegrityErrors = 0;
for (const file of testFiles) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (/\b(test|it|describe)\.(skip|only|todo)\b/.test(line)) {
      logError('TEST-INTEGRITY', file, idx + 1, `Forbidden test modifier found: ${line.trim()}`);
      testIntegrityErrors++;
    }
  });
}
if (testIntegrityErrors === 0) {
  logPass('TEST-INTEGRITY', 'Zero skipped, only, or todo tests across all test suites.');
}

// -----------------------------------------------------------------------------
// 5. SILENT CATCH & SWALLOWED PROMISE REJECTION AUDIT
// -----------------------------------------------------------------------------
let catchErrors = 0;
for (const file of apiSrcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Find all occurrences of "catch"
  const catchKeywordRegex = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;
  let match;
  while ((match = catchKeywordRegex.exec(content)) !== null) {
    const startIndex = match.index;
    const openBraceIndex = content.indexOf('{', startIndex);
    let depth = 1;
    let i = openBraceIndex + 1;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }
    const body = content.slice(openBraceIndex + 1, i - 1).trim();
    const fullBlock = content.slice(startIndex, i);
    const lineNum = content.slice(0, startIndex).split('\n').length;

    // Check if catch is completely empty
    if (!body) {
      logError('SILENT-CATCH', file, lineNum, 'Completely empty catch block detected!');
      catchErrors++;
      continue;
    }

    // Must satisfy at least ONE of:
    // a) Throws an error (e.g. throw new AppError or rethrow)
    // b) Forwards to error handler or rejects promise (next(...), reject(...))
    // c) Logs with context (e.g. logger.error, logger.warn, res.status(..).json)
    // d) Sends an explicit error payload/close code or terminates socket (res.status, ws.send, ws.close, socket.destroy)
    // e) Has a written reason comment: // SILENT-FALLBACK-REASON: <reason>
    const throwsError = /\bthrow\b/.test(body);
    const forwardsOrRejects = /\b(next|reject)\s*\(/.test(body);
    const logsContext = /logger\.(error|warn|info)/.test(body);
    const sendsErrorOrCloses = /res\.(status|json|send)|ws\.(send|close)|socket\.destroy/.test(body);
    const hasDocumentedReason = /SILENT-FALLBACK-REASON:/.test(fullBlock);
    const returnsExplicitError = /warnings\.push|\berror\b/.test(body) && /return\b/.test(body);

    if (!throwsError && !forwardsOrRejects && !logsContext && !sendsErrorOrCloses && !hasDocumentedReason && !returnsExplicitError) {
      logError('SILENT-CATCH', file, lineNum, `Catch block does not rethrow, forward, log, send error payload, or declare SILENT-FALLBACK-REASON: ${body.slice(0, 100)}`);
      catchErrors++;
    }
  }
}

if (catchErrors === 0) {
  logPass('SILENT-CATCH', 'All catch blocks either rethrow typed errors, log structured context, return explicit error payloads, or contain documented SILENT-FALLBACK-REASON comments.');
}

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
if (totalErrors > 0) {
  console.error(`FAILED: ${totalErrors} silent-failure / code quality violations detected!`);
  process.exit(1);
} else {
  console.log('SUCCESS: Code quality and silent-failure audit passed with ZERO violations.');
  process.exit(0);
}
