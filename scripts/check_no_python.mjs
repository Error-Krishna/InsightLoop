#!/usr/bin/env node
/**
 * scripts/check_no_python.mjs
 *
 * Permanent Enforcement Gate: Guarantees Python & Django never return to InsightLoop.
 * 
 * Checks:
 * 1. Filesystem scan for forbidden file extensions (.py, .pyc, .pyo) and filenames
 *    (requirements*.txt, Pipfile, pyproject.toml, manage.py, Procfile, etc.)
 * 2. Tracked git repository content scan for forbidden tokens:
 *    (python|django|mongoengine|daphne|gunicorn|weasyprint|simplejwt|setup-python|pip install)
 *    Enforces a strict, explicit allowlist for:
 *    - docs/MIGRATION_HISTORY.md
 *    - docs/archive/**
 *    - Golden fixtures (fixtures/**, apps/api/test/contracts/fixtures/**)
 *    - Historical migration records & frozen schema (docs/migration/**)
 *    - Offline parity tests & test runner scripts (apps/api/test/**, test/**, scripts/**)
 *    - Exact lines in apps/api/src specified by file and keyword (PBKDF2, JWT derivation, naive ISO)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// 1. Forbidden File Patterns (Filesystem)
const FORBIDDEN_FILE_PATTERNS = [
  /\.py$/i,
  /\.pyc$/i,
  /\.pyo$/i,
  /^requirements.*\.txt$/i,
  /^Pipfile(\.lock)?$/i,
  /^pyproject\.toml$/i,
  /^setup\.cfg$/i,
  /^pytest\.ini$/i,
  /^\.flake8$/i,
  /^tox\.ini$/i,
  /^manage\.py$/i,
  /^Procfile$/i,
  /^\.python-version$/i,
  /^runtime\.txt$/i,
];

// 2. Forbidden Content Regex (Tracked Files)
const FORBIDDEN_TOKEN_REGEX = /(python|django|mongoengine|daphne|gunicorn|weasyprint|simplejwt|setup-python|pip install)/i;

// 3. Explicit Allowed Path Prefixes
const ALLOWED_PATH_PREFIXES = [
  'docs/MIGRATION_HISTORY.md',
  'docs/archive/',
  'fixtures/',
  'apps/api/test/contracts/fixtures/',
  'docs/migration/',
  'apps/api/test/',
  'test/',
  'scripts/',
];

// 4. Exact Line-by-Line Allowlist for Source Files (apps/api/src)
const ALLOWED_SOURCE_LINES = [
  {
    file: 'apps/api/src/utils/crypto.ts',
    keywords: ['Django-formatted PBKDF2 hash', 'djangoHash', 'pbkdf2_sha256'],
    reason: 'Django PBKDF2 password-hash verification format compatibility',
  },
  {
    file: 'apps/api/src/utils/jwt.ts',
    keywords: ['Django simplejwt'],
    reason: 'JWT signing and key derivation parity',
  },
  {
    file: 'apps/api/src/utils/timezone.ts',
    keywords: ['formatDjangoIso'],
    reason: 'Naive ISO-8601 timestamp formatting parity helper',
  },
  {
    file: 'apps/api/src/modules/contact/contact.controller.ts',
    keywords: ['docs.djangoproject.com', 'Django'],
    reason: 'Contract fixture compatibility 403 CSRF error page',
  },
  {
    file: 'apps/api/src/modules/ai/ai.service.ts',
    keywords: ['formatDjangoIso'],
    reason: 'Naive ISO timestamp formatting parity',
  },
  {
    file: 'apps/api/src/modules/bills/bills.service.ts',
    keywords: ['formatDjangoIso'],
    reason: 'Naive ISO timestamp formatting parity',
  },
  {
    file: 'apps/api/src/modules/dashboard/dashboard.service.ts',
    keywords: ['formatDjangoIso'],
    reason: 'Naive ISO timestamp formatting parity',
  },
  {
    file: 'apps/api/src/modules/insights/insights.service.ts',
    keywords: ['formatDjangoIso'],
    reason: 'Naive ISO timestamp formatting parity',
  },
  {
    file: 'apps/api/src/modules/inventory/inventory.service.ts',
    keywords: ['formatDjangoIso'],
    reason: 'Naive ISO timestamp formatting parity',
  },
  {
    file: 'apps/api/src/modules/workers/workers.service.ts',
    keywords: ['formatDjangoIso'],
    reason: 'Naive ISO timestamp formatting parity',
  },
];

console.log('===============================================================');
console.log('INSIGHTLOOP PERMANENT PYTHON & DJANGO PREVENTION GATE');
console.log('===============================================================\n');

let violations = 0;

// Step 1: Scan for forbidden files in repository root & tracked files
console.log('--- Step 1: Scanning repository for forbidden file artifacts ---');

function scanDirectoryForForbiddenFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.turbo' || entry.name === 'dist') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(REPO_ROOT, fullPath);

    for (const pattern of FORBIDDEN_FILE_PATTERNS) {
      if (pattern.test(entry.name)) {
        console.error(`❌ FORBIDDEN FILE DETECTED: ${relPath}`);
        violations++;
      }
    }

    if (entry.isDirectory()) {
      scanDirectoryForForbiddenFiles(fullPath);
    }
  }
}

scanDirectoryForForbiddenFiles(REPO_ROOT);

if (violations === 0) {
  console.log('✅ No forbidden Python or Django files found in repository tree.\n');
} else {
  console.error(`❌ Found ${violations} forbidden file(s) on disk.\n`);
}

// Step 2: Tracked file content audit
console.log('--- Step 2: Auditing tracked repository file contents ---');
let trackedFiles = [];
try {
  const output = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf-8' });
  trackedFiles = output.split('\n').filter(Boolean);
} catch (err) {
  console.error('❌ Failed to execute git ls-files:', err.message);
  process.exit(1);
}

let contentViolations = 0;
let allowedMatchesCount = 0;

for (const relPath of trackedFiles) {
  // Check if entire file/path is covered by explicit path prefix allowlist
  const isPrefixAllowed = ALLOWED_PATH_PREFIXES.some(prefix =>
    relPath === prefix || relPath.startsWith(prefix)
  );

  const fullPath = path.resolve(REPO_ROOT, relPath);
  if (!fs.existsSync(fullPath)) continue;

  // Check if file is binary
  const buffer = fs.readFileSync(fullPath);
  const isBinary = buffer.includes(0);
  if (isBinary) continue;

  const content = buffer.toString('utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = FORBIDDEN_TOKEN_REGEX.exec(line);
    if (!match) continue;

    if (isPrefixAllowed) {
      allowedMatchesCount++;
      continue;
    }

    // Allow references to the check_no_python enforcement gate itself
    if (line.includes('check_no_python') || line.includes('check:no-python') || line.includes('Permanent Decommissioning')) {
      allowedMatchesCount++;
      continue;
    }

    // Check if line is covered by specific source line allowlist
    const sourceAllowRule = ALLOWED_SOURCE_LINES.find(rule => rule.file === relPath);
    if (sourceAllowRule) {
      const keywordMatch = sourceAllowRule.keywords.some(kw => line.includes(kw));
      if (keywordMatch) {
        allowedMatchesCount++;
        continue;
      }
    }

    console.error(`❌ FORBIDDEN TOKEN "${match[0]}" at ${relPath}:${i + 1}`);
    console.error(`   Line: ${line.trim().slice(0, 100)}`);
    contentViolations++;
  }
}

console.log(`Audited ${trackedFiles.length} tracked files.`);
console.log(`Allowed legitimate compatibility matches verified: ${allowedMatchesCount}`);

if (contentViolations > 0 || violations > 0) {
  console.error(`\n❌ PERMANENT PYTHON PREVENTION GATE FAILED: ${violations + contentViolations} violation(s) found!`);
  process.exit(1);
}

console.log('\n===============================================================');
console.log('✅ PERMANENT PYTHON & DJANGO PREVENTION GATE PASSED CLEANLY');
console.log('   Zero forbidden files. Zero unallowed Python/Django references.');
console.log('===============================================================');
process.exit(0);
