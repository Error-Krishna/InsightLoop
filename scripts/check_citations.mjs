#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const targetDir = process.argv[2] ? path.resolve(REPO_ROOT, process.argv[2]) : path.resolve(REPO_ROOT, 'docs');

function findMarkdownFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== '.git') {
        results = results.concat(findMarkdownFiles(fullPath));
      }
    } else if (item.isFile() && item.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

const mdFiles = findMarkdownFiles(targetDir);
console.log(`Scanning ${mdFiles.length} markdown file(s) under ${path.relative(REPO_ROOT, targetDir)}...`);

// Regex to capture file paths matching (apps|packages|scripts|insightloop|docs)/[^\s)`"'<>]+
// or relative markdown links [text](path)
const pathRegex = /(?:`|\]\(|["'\s(])((?:apps|packages|scripts|insightloop|docs)\/[a-zA-Z0-9_.\-\/]+)/g;
const relativeLinkRegex = /\]\(((?:\.|\.\.)\/[a-zA-Z0-9_.\-\/#]+)\)/g;

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
    totalChecked++;
    const fullCandidate = path.resolve(REPO_ROOT, candidate);
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
    totalChecked++;
    const fullCandidate = path.resolve(path.dirname(filePath), candidate);
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

if (errors.length > 0) {
  console.error(`\n❌ Found ${errors.length} broken citation(s):`);
  for (const err of errors) {
    console.error(`  In ${err.sourceFile}: '${err.citation}' -> does not exist`);
  }
  process.exit(1);
} else {
  console.log(`✅ All ${totalChecked} citations valid!`);
  process.exit(0);
}
