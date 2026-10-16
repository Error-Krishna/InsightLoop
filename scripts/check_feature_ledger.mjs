/**
 * check_feature_ledger.mjs
 *
 * Verifies completeness and integrity of docs/migration/python-feature-ledger.md
 *
 * Rules:
 * 1. Every non-test Python file in insightloop/ MUST be cataloged in the ledger.
 * 2. Every Django source file in the ledger MUST exist on disk.
 * 3. Every Node target file for PORTED / SUPERSEDED rows MUST exist on disk.
 * 4. No blank or empty columns allowed.
 * 5. Status must be one of: PORTED, SUPERSEDED, DEAD-CODE, NEEDS-TRAFFIC-EVIDENCE.
 * 6. Every DEAD-CODE or NEEDS-TRAFFIC-EVIDENCE entry must have explicit evidence / justification.
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

// 1. Gather all actual python files in insightloop/
const findCmd = 'find insightloop -name "*.py" -not -path "*/.*" -not -path "*/__pycache__*"';
const actualPyFiles = execSync(findCmd, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Found ${actualPyFiles.length} Python files in insightloop/.`);

// 2. Parse Markdown table from ledger
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
  // cells[0] is empty string before first |, cells[cells.length - 1] empty after last |
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
  const djangoFile = row['Django File'] || row['Python File'];
  const status = row['Status'];
  const nodeTarget = row['Node Target'];
  const evidence = row['Parity Evidence'];
  const residualDiffs = row['Residual Diffs'];

  if (!djangoFile) {
    errors.push(`Row ${rowNum}: Missing Django File.`);
    continue;
  }

  catalogedFiles.add(djangoFile);

  // Check Django file exists
  if (!fs.existsSync(path.resolve(djangoFile))) {
    errors.push(`Row ${rowNum}: Django file does not exist on disk: ${djangoFile}`);
  }

  // Check Status
  if (!VALID_STATUSES.has(status)) {
    errors.push(`Row ${rowNum}: Invalid status "${status}". Must be one of: ${Array.from(VALID_STATUSES).join(', ')}`);
  }

  // Check blank fields
  if (!nodeTarget) {
    errors.push(`Row ${rowNum} (${djangoFile}): Node Target cannot be blank.`);
  }
  if (!evidence) {
    errors.push(`Row ${rowNum} (${djangoFile}): Parity Evidence cannot be blank.`);
  }
  if (!residualDiffs) {
    errors.push(`Row ${rowNum} (${djangoFile}): Residual Diffs cannot be blank (use 'None' if zero diffs).`);
  }

  // If PORTED or SUPERSEDED, check that referenced Node file exists
  if (status === 'PORTED' || status === 'SUPERSEDED') {
    // extract path before '#' or ':'
    const firstPart = nodeTarget.split('#')[0].split(':')[0].trim();
    if (firstPart && !firstPart.startsWith('N/A') && !firstPart.startsWith('None')) {
      // If it looks like a path
      if (firstPart.includes('/') || firstPart.endsWith('.ts') || firstPart.endsWith('.tsx') || firstPart.endsWith('.mjs')) {
        if (!fs.existsSync(path.resolve(firstPart))) {
          errors.push(`Row ${rowNum} (${djangoFile}): Referenced Node target file does not exist on disk: ${firstPart}`);
        }
      }
    }
  }

  // If DEAD-CODE or NEEDS-TRAFFIC-EVIDENCE, verify justification in evidence
  if (status === 'DEAD-CODE' || status === 'NEEDS-TRAFFIC-EVIDENCE') {
    if (evidence.length < 10) {
      errors.push(`Row ${rowNum} (${djangoFile}): Detailed justification required in Parity Evidence for ${status}.`);
    }
  }
}

// Check for missing Python files
for (const pyFile of actualPyFiles) {
  if (!catalogedFiles.has(pyFile)) {
    errors.push(`Missing Python file in ledger: ${pyFile}`);
  }
}

console.log('\n--- AUDIT RESULTS ---');
console.log(`Total Python files checked: ${actualPyFiles.length}`);
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
