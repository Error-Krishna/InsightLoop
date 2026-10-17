#!/usr/bin/env node
/**
 * scripts/check_web_env_vars.mjs
 *
 * Scans all files under apps/web/src and verifies:
 * 1. Only allowed Vercel environment variables (VITE_API_BASE_URL, VITE_WS_BASE_URL, VITE_GOOGLE_CLIENT_ID)
 *    plus standard Vite built-in vars (MODE, BASE_URL, PROD, DEV, SSR) are referenced.
 * 2. Obsolete VITE_API_URL is nowhere in apps/web/src.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const srcDir = path.resolve(ROOT, 'apps/web/src');

const ALLOWED_VITE_VARS = new Set([
  'VITE_API_BASE_URL',
  'VITE_WS_BASE_URL',
  'VITE_GOOGLE_CLIENT_ID',
]);

const BUILTIN_VITE_VARS = new Set(['MODE', 'BASE_URL', 'PROD', 'DEV', 'SSR']);

function getSourceFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = getSourceFiles(srcDir);
const envRegex = /import\.meta\.env(?:\??\.([A-Za-z0-9_]+)|\[['"]([A-Za-z0-9_]+)['"]\])/g;
const errors = [];

for (const file of files) {
  const rel = path.relative(srcDir, file);
  const content = fs.readFileSync(file, 'utf-8');

  if (content.includes('VITE_API_URL')) {
    errors.push(`${rel}: contains obsolete variable VITE_API_URL`);
  }

  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    let match;
    while ((match = envRegex.exec(line)) !== null) {
      const varName = match[1] || match[2];
      if (!ALLOWED_VITE_VARS.has(varName) && !BUILTIN_VITE_VARS.has(varName)) {
        errors.push(`${rel}:${idx + 1}: references undeclared environment variable '${varName}'`);
      }
    }
  });
}

// 3. Scan all markdown files in docs/ and root to verify VITE_API_BASE_URL always ends in /api/v1
function getMarkdownFiles(dir) {
  const mdFiles = [];
  if (!fs.existsSync(dir)) return mdFiles;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build', '.venv'].includes(entry.name)) {
      mdFiles.push(...getMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      mdFiles.push(fullPath);
    }
  }
  return mdFiles;
}

const docsDir = path.resolve(ROOT, 'docs');
const allDocs = [...getMarkdownFiles(docsDir), ...getMarkdownFiles(ROOT).filter((f) => path.dirname(f) === ROOT)];

for (const docFile of allDocs) {
  const relDoc = path.relative(ROOT, docFile);
  const docContent = fs.readFileSync(docFile, 'utf-8');
  const lines = docContent.split('\n');

  lines.forEach((line, idx) => {
    if (line.includes('VITE_API_BASE_URL')) {
      const match = line.match(/https?:\/\/[^\s`'"|)]+/);
      if (match) {
        const url = match[0];
        const hasApiV1 = url.endsWith('/api/v1') || url.endsWith('/api/v1/');
        if (!hasApiV1) {
          errors.push(
            `${relDoc}:${idx + 1}: VITE_API_BASE_URL must end with '/api/v1' (found '${url}'). Web client appends endpoints directly to base URL.`
          );
        }
      }
    }

    if (line.includes('VITE_WS_BASE_URL')) {
      const match = line.match(/wss?:\/\/[^\s`'"|)]+/);
      if (match) {
        const url = match[0];
        const urlObj = new URL(url.replace(/^ws/, 'http'));
        if (urlObj.pathname && urlObj.pathname !== '/') {
          errors.push(
            `${relDoc}:${idx + 1}: VITE_WS_BASE_URL must have no subpath (found '${url}'). WebSocket client builds endpoint paths dynamically.`
          );
        }
      }
    }
  });
}

if (errors.length > 0) {
  console.error('[WEB-ENV-CHECK] ✗ Failed with errors:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`[WEB-ENV-CHECK] ✓ SUCCESS: All ${files.length} source files under apps/web/src and all ${allDocs.length} documentation files satisfy environment variable invariants!`);
process.exit(0);
