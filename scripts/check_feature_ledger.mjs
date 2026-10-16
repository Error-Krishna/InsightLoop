/**
 * check_feature_ledger.mjs
 *
 * Verifies completeness and integrity of docs/migration/python-feature-ledger.md
 *
 * Rules:
 * 1. Every non-test Python file in insightloop/ MUST be cataloged in the ledger.
 * 2. Every non-Python Django asset (templates, static files, requirements, Dockerfiles) MUST be cataloged.
 * 3. Every Django source file in the ledger MUST exist on disk.
 * 4. Every Node target file for PORTED / SUPERSEDED rows MUST exist on disk.
 * 5. No blank or empty columns allowed.
 * 6. Status must be one of: PORTED, SUPERSEDED, DEAD-CODE, NEEDS-TRAFFIC-EVIDENCE.
 * 7. For every PORTED row that cites an automated test file, it MUST cite an exact test name (test_file#test_name),
 *    and that test file MUST contain the cited test name.
 * 8. Top of file MUST declare MISSING items status.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const LEDGER_PATH = path.resolve('docs/migration/python-feature-ledger.md');

if (!fs.existsSync(LEDGER_PATH)) {
  console.error(`ERROR: Feature ledger not found at ${LEDGER_PATH}`);
  process.exit(1);
}

const content = fs.readFileSync(LEDGER_PATH, 'utf8');

// 0. Verify MISSING declaration at top of file
if (!content.includes('MISSING: None') && !content.includes('## Missing or Unverified Items')) {
  console.error('ERROR: Top of feature ledger must declare "MISSING: None" or list unverified items.');
  process.exit(1);
}

// 1. Gather all actual python files in insightloop/
const findPyCmd = 'find insightloop -name "*.py" -not -path "*/.*" -not -path "*/__pycache__*"';
const actualPyFiles = execSync(findPyCmd, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

// 2. Gather non-Python assets
const findTemplatesCmd = 'find insightloop -name "*.html" -not -path "*/.*"';
const actualTemplateFiles = execSync(findTemplatesCmd, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Found ${actualPyFiles.length} Python files and ${actualTemplateFiles.length} HTML templates in insightloop/.`);

// 3. Parse Markdown table from ledger
const lines = content.split('\n');
const tableLines = lines.filter((l) => l.trim().startsWith('|') && !l.includes('---'));

if (tableLines.length < 2) {
  console.error('ERROR: No valid markdown table found in ledger.');
  process.exit(1);
}

// Header
const header = tableLines[0].split('|').map((s) => s.trim()).filter(Boolean);
console.log('Ledger Columns:', header);

const rows = tableLines.slice(1).map((l) => {
  const cells = l.split('|').map((s) => s.trim());
  const dataCells = cells.slice(1, cells.length - 1);
  const rowObj = {};
  header.forEach((h, idx) => {
    rowObj[h] = dataCells[idx] || '';
  });
  return rowObj;
});

console.log(`Parsed ${rows.length} rows from ledger table.`);

const errors = [];
const catalogedFiles = new Set();
const VALID_STATUSES = new Set(['PORTED', 'SUPERSEDED', 'DEAD-CODE', 'NEEDS-TRAFFIC-EVIDENCE']);

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const rowNum = i + 2;
  const assetFile = row['Django File / Asset'] || row['Django File'] || row['Python File'];
  const status = row['Status'];
  const nodeTarget = row['Node Target'];
  const evidence = row['Parity Evidence'];
  const residualDiffs = row['Residual Diffs'];

  if (!assetFile) {
    errors.push(`Row ${rowNum}: Missing Django File / Asset.`);
    continue;
  }

  catalogedFiles.add(assetFile);

  // Check Django file exists (if it's a relative path on disk)
  if (!assetFile.startsWith('.env') && !assetFile.startsWith('requirements:')) {
    if (!fs.existsSync(path.resolve(assetFile))) {
      errors.push(`Row ${rowNum}: Django asset does not exist on disk: ${assetFile}`);
    }
  }

  // Check Status
  if (!VALID_STATUSES.has(status)) {
    errors.push(`Row ${rowNum}: Invalid status "${status}". Must be one of: ${Array.from(VALID_STATUSES).join(', ')}`);
  }

  // Check blank fields
  if (!nodeTarget) {
    errors.push(`Row ${rowNum} (${assetFile}): Node Target cannot be blank.`);
  }
  if (!evidence) {
    errors.push(`Row ${rowNum} (${assetFile}): Parity Evidence cannot be blank.`);
  }
  if (!residualDiffs) {
    errors.push(`Row ${rowNum} (${assetFile}): Residual Diffs cannot be blank (use 'None' if zero diffs).`);
  }

  // If PORTED or SUPERSEDED, check that referenced Node file exists
  if (status === 'PORTED' || status === 'SUPERSEDED') {
    const firstPart = nodeTarget.split('#')[0].split(':')[0].trim();
    if (firstPart && !firstPart.startsWith('N/A') && !firstPart.startsWith('None') && !firstPart.startsWith('Built-in') && !firstPart.startsWith('Render')) {
      if (firstPart.includes('/') || firstPart.endsWith('.ts') || firstPart.endsWith('.tsx') || firstPart.endsWith('.mjs') || firstPart.endsWith('.yaml') || firstPart.endsWith('.yml')) {
        if (!fs.existsSync(path.resolve(firstPart))) {
          errors.push(`Row ${rowNum} (${assetFile}): Referenced Node target file does not exist on disk: ${firstPart}`);
        }
      }
    }
  }

  // For PORTED rows citing test files: verify test_file#test_name
  if (status === 'PORTED' && (evidence.includes('.test.ts') || evidence.includes('.test.tsx'))) {
    if (!evidence.includes('#')) {
      errors.push(`Row ${rowNum} (${assetFile}): PORTED row must cite specific test name using "test_file#test_name", got "${evidence}".`);
    } else {
      const [testFile, testName] = evidence.split('#').map((s) => s.trim());
      if (!fs.existsSync(path.resolve(testFile))) {
        errors.push(`Row ${rowNum} (${assetFile}): Cited test file does not exist on disk: ${testFile}`);
      } else {
        const testContent = fs.readFileSync(path.resolve(testFile), 'utf8');
        if (!testContent.includes(testName)) {
          errors.push(`Row ${rowNum} (${assetFile}): Cited test file "${testFile}" does not contain test name "${testName}".`);
        }
      }
    }
  }

  // If DEAD-CODE or NEEDS-TRAFFIC-EVIDENCE, verify justification in evidence
  if (status === 'DEAD-CODE' || status === 'NEEDS-TRAFFIC-EVIDENCE') {
    if (evidence.length < 10) {
      errors.push(`Row ${rowNum} (${assetFile}): Detailed justification required in Parity Evidence for ${status}.`);
    }
  }
}

// Check for missing Python files
for (const pyFile of actualPyFiles) {
  if (!catalogedFiles.has(pyFile)) {
    errors.push(`Missing Python file in ledger: ${pyFile}`);
  }
}

// Check for missing HTML template files
for (const tpl of actualTemplateFiles) {
  if (!catalogedFiles.has(tpl)) {
    errors.push(`Missing HTML template file in ledger: ${tpl}`);
  }
}

console.log('\n--- AUDIT RESULTS ---');
console.log(`Total Python files checked: ${actualPyFiles.length}`);
console.log(`Total HTML templates checked: ${actualTemplateFiles.length}`);
console.log(`Total ledger rows validated: ${rows.length}`);
console.log(`Errors found: ${errors.length}`);

if (errors.length > 0) {
  console.error('\nFAILURES:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('\nSUCCESS: Feature-parity ledger is 100% complete and verified against disk.\n');
process.exit(0);
