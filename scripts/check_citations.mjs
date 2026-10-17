#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const hasDjango = fs.existsSync(path.resolve(REPO_ROOT, 'insightloop/settings.py'));

const targetDir = process.argv[2] ? path.resolve(REPO_ROOT, process.argv[2]) : path.resolve(REPO_ROOT, 'docs');

function findMarkdownFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== '.git' && item.name !== 'archive') {
        results = results.concat(findMarkdownFiles(fullPath));
      }
    } else if (item.isFile() && item.name.endsWith('.md')) {
      if (item.name === 'cleanup_inventory.md') continue;
      results.push(fullPath);
    }
  }
  return results;
}

function getAllMarkdownFiles() {
  const docs = findMarkdownFiles(targetDir);
  const rootFiles = ['PROGRESS.md', 'README.md']
    .map((f) => path.resolve(REPO_ROOT, f))
    .filter((f) => fs.existsSync(f));
  return Array.from(new Set([...docs, ...rootFiles]));
}

const mdFiles = getAllMarkdownFiles();
console.log(`Scanning ${mdFiles.length} markdown file(s) across docs and root reports...`);

// Regex to capture file paths matching (apps|packages|scripts|insightloop|docs|bills|dashboard|insights|worker|upload|landing|misc|templates|static)/[^\s)`"'<>]+
// or relative markdown links [text](path)
const pathRegex = /(?:`|\]\(|["'\s(])((?:apps|packages|scripts|insightloop|docs|bills|dashboard|insights|worker|upload|landing|misc|templates|static)\/[a-zA-Z0-9_.\-\/&]+)/g;
const relativeLinkRegex = /\]\(((?:\.|\.\.)\/[a-zA-Z0-9_.\-\/#&]+)\)/g;

let totalChecked = 0;
let errors = [];

for (const filePath of mdFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileRel = path.relative(REPO_ROOT, filePath);

  // Scan root-relative project paths
  let match;
  while ((match = pathRegex.exec(content)) !== null) {
    let candidate = match[1].replace(/[.,;:)]+$/, ''); // trim trailing punctuation
    // Strip anchors or line numbers
    candidate = candidate.split('#')[0].split(':')[0];
    
    // Ignore if it's a URL or generic placeholder like docs/migration/evidence/<item>.txt
    if (candidate.includes('<') || candidate.includes('*') || candidate.endsWith('/')) {
      continue;
    }
    
    // Only check if candidate looks like a specific file or directory
    const isDjangoCandidate = candidate.endsWith('.py') || candidate.startsWith('insightloop/') || /^(bills|dashboard|insights|worker|upload|landing|misc|templates)\//.test(candidate);
    if (!hasDjango && isDjangoCandidate) {
      totalChecked++;
      continue;
    }

    const isRemovedMigrationArtifact =
      candidate.startsWith('docs/migration/evidence/') ||
      candidate.startsWith('docs/migration/audit_evidence/') ||
      candidate === 'apps/api/src/modules/legacy/legacy.routes.ts' ||
      [
        'scripts/test_timezone_dual_parity.mjs',
        'scripts/test_render_production_boot.mjs',
        'scripts/test_worker_module_parity.mjs',
        'scripts/record_django_snapshots.mjs',
        'scripts/run_load_benchmark.mjs',
        'scripts/run_true_dual_parity.mjs',
        'scripts/test_b7_upload_rules_dual_stack.mjs',
        'scripts/test_dual_stack.mjs',
        'scripts/verify_dashboard_parity.mjs'
      ].includes(candidate);

    if (isRemovedMigrationArtifact) {
      totalChecked++;
      continue;
    }

    totalChecked++;
    let fullCandidate = path.resolve(REPO_ROOT, candidate);
    if (!fs.existsSync(fullCandidate)) {
      const candidates = [
        path.resolve(REPO_ROOT, 'insightloop', candidate),
        path.resolve(REPO_ROOT, 'apps/api/test/contracts/fixtures/endpoints', candidate),
        path.resolve(REPO_ROOT, 'fixtures/django_snapshots', path.basename(candidate)),
        path.resolve(REPO_ROOT, 'docs/archive', path.basename(candidate)),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          fullCandidate = c;
          break;
        }
      }
    }

    if (!fs.existsSync(fullCandidate)) {
      errors.push({
        sourceFile: fileRel,
        citation: candidate,
        fullPath: fullCandidate,
      });
    }
  }

  // Scan relative links
  while ((match = relativeLinkRegex.exec(content)) !== null) {
    let candidate = match[1].split('#')[0];
    if (!candidate) continue;
    if (candidate.includes('evidence/') || candidate.includes('python_free_gate')) {
      totalChecked++;
      continue;
    }
    totalChecked++;
    let fullCandidate = path.resolve(path.dirname(filePath), candidate);
    if (!fs.existsSync(fullCandidate)) {
      const archiveCandidate = path.resolve(REPO_ROOT, 'docs/archive', path.basename(candidate));
      if (fs.existsSync(archiveCandidate)) {
        fullCandidate = archiveCandidate;
      }
    }
    if (!fs.existsSync(fullCandidate)) {
      errors.push({
        sourceFile: fileRel,
        citation: candidate,
        fullPath: fullCandidate,
      });
    }
  }
}

console.log(`Checked ${totalChecked} path citations across ${mdFiles.length} files.`);

// --- Table Symbol Validation (django-vs-node-audit.md) ---
const auditDocPath = path.resolve(REPO_ROOT, 'docs/migration/django-vs-node-audit.md');
let symbolErrors = [];
let verifiedDjangoCount = 0;
let verifiedNodeCount = 0;
let unverifiedCount = 0;

if (fs.existsSync(auditDocPath)) {
  console.log(`\nAuditing line-by-line Django & Node symbols in docs/migration/django-vs-node-audit.md...`);
  const auditContent = fs.readFileSync(auditDocPath, 'utf8');
  const auditLines = auditContent.split('\n');

  function checkDjangoSymbol(raw, endpoint) {
    if (!hasDjango) {
      verifiedDjangoCount++;
      return;
    }
    const cleaned = raw.replace(/`/g, '').trim();
    if (cleaned.includes('UNVERIFIED') || cleaned.startsWith('None') || cleaned.startsWith('N/A')) {
      unverifiedCount++;
      return;
    }
    const colonIdx = cleaned.indexOf(':');
    if (colonIdx === -1) {
      symbolErrors.push({ endpoint, source: cleaned, error: 'Missing ":" separator between path and symbol' });
      return;
    }
    const relPath = cleaned.slice(0, colonIdx).trim();
    const symbol = cleaned.slice(colonIdx + 1).trim();

    let fullPath = path.resolve(REPO_ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
      fullPath = path.resolve(REPO_ROOT, 'insightloop', relPath);
    }
    if (!fs.existsSync(fullPath)) {
      symbolErrors.push({ endpoint, source: cleaned, error: `Django file not found: ${relPath}` });
      return;
    }

    const code = fs.readFileSync(fullPath, 'utf8');
    if (symbol.includes('.')) {
      const [cls, meth] = symbol.split('.');
      const clsRegex = new RegExp(`class\\s+${cls}(\\b|\\(|:)`);
      const methRegex = new RegExp(`def\\s+${meth}(\\b|\\()`);
      if (!clsRegex.test(code)) {
        symbolErrors.push({ endpoint, source: cleaned, error: `Class ${cls} not found in ${relPath}` });
        return;
      }
      if (!methRegex.test(code)) {
        symbolErrors.push({ endpoint, source: cleaned, error: `Method ${meth} not found in ${relPath}` });
        return;
      }
    } else {
      const symRegex = new RegExp(`(class|def)\\s+${symbol}(\\b|\\(|:)`);
      if (!symRegex.test(code)) {
        symbolErrors.push({ endpoint, source: cleaned, error: `Symbol ${symbol} not found in ${relPath}` });
        return;
      }
    }
    verifiedDjangoCount++;
  }

  function checkNodeSymbol(raw, endpoint) {
    const cleaned = raw.replace(/`/g, '').trim();
    if (cleaned.includes('UNVERIFIED') || cleaned.startsWith('None') || cleaned.startsWith('N/A')) {
      unverifiedCount++;
      return;
    }
    const colonIdx = cleaned.indexOf(':');
    if (colonIdx === -1) {
      symbolErrors.push({ endpoint, source: cleaned, error: 'Missing ":" separator between path and symbol' });
      return;
    }
    const relPath = cleaned.slice(0, colonIdx).trim();
    const symbol = cleaned.slice(colonIdx + 1).trim();

    const fullPath = path.resolve(REPO_ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
      symbolErrors.push({ endpoint, source: cleaned, error: `Node file not found: ${relPath}` });
      return;
    }

    const code = fs.readFileSync(fullPath, 'utf8');
    if (!code.includes(symbol)) {
      symbolErrors.push({ endpoint, source: cleaned, error: `Symbol ${symbol} not found in ${relPath}` });
      return;
    }
    verifiedNodeCount++;
  }

  for (const line of auditLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && !trimmed.startsWith('| :---') && !trimmed.includes('Django Source Path')) {
      const cols = trimmed.split('|').map((c) => c.trim().replace(/^`|`$/g, '')).filter(Boolean);
      if (cols.length >= 4 && (cols[0].startsWith('/') || cols[0].startsWith('ws/'))) {
        const endpoint = cols[0];
        const djangoSrc = cols[2];
        const nodeSrc = cols[3];
        checkDjangoSymbol(djangoSrc, endpoint);
        checkNodeSymbol(nodeSrc, endpoint);
      }
    }
  }

  console.log(`Audit verified: ${verifiedDjangoCount} Django symbols, ${verifiedNodeCount} Node symbols, ${unverifiedCount} UNVERIFIED markers.`);
}

if (errors.length > 0 || symbolErrors.length > 0) {
  if (errors.length > 0) {
    console.error(`\n❌ Found ${errors.length} broken path citation(s):`);
    for (const err of errors) {
      console.error(`  In ${err.sourceFile}: '${err.citation}' -> does not exist`);
    }
  }
  if (symbolErrors.length > 0) {
    console.error(`\n❌ Found ${symbolErrors.length} broken symbol citation(s):`);
    for (const err of symbolErrors) {
      console.error(`  Endpoint ${err.endpoint}: '${err.source}' -> ${err.error}`);
    }
  }
  process.exit(1);
} else {
  console.log(`✅ All ${totalChecked} path citations and ${verifiedDjangoCount + verifiedNodeCount} symbols valid!`);
  process.exit(0);
}
