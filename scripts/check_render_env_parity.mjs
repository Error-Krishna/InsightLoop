#!/usr/bin/env node
/**
 * scripts/check_render_env_parity.mjs
 *
 * Verifies that all environment variables declared in render-blueprint.yaml
 * match root .env.example EXACTLY (bidirectional set equality).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const blueprintPath = path.join(rootDir, 'render-blueprint.yaml');
const envExamplePath = path.join(rootDir, '.env.example');

if (!fs.existsSync(blueprintPath)) {
  console.error(`Missing blueprint file: ${blueprintPath}`);
  process.exit(1);
}

if (!fs.existsSync(envExamplePath)) {
  console.error(`Missing .env.example file: ${envExamplePath}`);
  process.exit(1);
}

// 1. Extract keys from render-blueprint.yaml
const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');
const blueprintKeys = new Set();
const keyRegex = /-\s+key:\s+([A-Za-z0-9_]+)/g;
let match;
while ((match = keyRegex.exec(blueprintContent)) !== null) {
  blueprintKeys.add(match[1]);
}

// 2. Extract keys from .env.example
const envContent = fs.readFileSync(envExamplePath, 'utf-8');
const envKeys = new Set();
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    envKeys.add(key);
  }
}

console.log(`[ENV-PARITY] render-blueprint.yaml declared keys: ${blueprintKeys.size}`);
console.log(`[ENV-PARITY] .env.example declared keys: ${envKeys.size}`);

const missingInEnv = [...blueprintKeys].filter((k) => !envKeys.has(k));
const missingInBlueprint = [...envKeys].filter((k) => !blueprintKeys.has(k));

let hasErrors = false;

if (missingInEnv.length > 0) {
  console.error(`[ENV-PARITY] ✗ Keys present in render-blueprint.yaml but missing in .env.example:`, missingInEnv);
  hasErrors = true;
}

if (missingInBlueprint.length > 0) {
  console.error(`[ENV-PARITY] ✗ Keys present in .env.example but missing in render-blueprint.yaml:`, missingInBlueprint);
  hasErrors = true;
}

if (hasErrors) {
  console.error(`[ENV-PARITY] FAILED: Blueprint and .env.example env vars do not match exactly.`);
  process.exit(1);
}

console.log(`[ENV-PARITY] SUCCESS: All ${blueprintKeys.size} environment variables match exactly!`);
process.exit(0);
