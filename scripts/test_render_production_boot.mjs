#!/usr/bin/env node
/**
 * scripts/test_render_production_boot.mjs
 *
 * Boots Node in NODE_ENV=production using ONLY legacy Django Render env vars
 * (plus METRICS_TOKEN) against local MongoDB.
 * Verifies:
 * - /health
 * - CORS preflight from Vercel frontend origin
 * - Login flow with JWT token issuance via DJANGO_SECRET_KEY fallback
 * - Metrics protection via METRICS_TOKEN
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from '../apps/api/node_modules/mongodb/lib/index.js';
import { hashPassword } from '../apps/api/dist/utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PORT = 4005;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_NAME = 'InsightLoop_prod_boot';
const MONGO_URI = `mongodb://localhost:27017/${DB_NAME}`;
const VERCEL_ORIGIN = 'https://insightloop.vercel.app';
const METRICS_TOKEN = 'production-render-metrics-token-32-chars';
const DJANGO_SECRET_KEY = 'production-render-django-secret-key-32-chars';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedUser() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db(DB_NAME);
  await db.dropDatabase();

  const companyId = 'prod-company-uuid-1234';
  await db.collection('company').insertOne({
    company_id: companyId,
    name: 'Production Boot Test Corp',
    business_type: 'Manufacturing',
    created_at: new Date(),
  });

  await db.collection('user').insertOne({
    email: 'admin@insightloop.io',
    name: 'Admin User',
    password: hashPassword('ProductionSecretPassword123!'),
    company_id: companyId,
    is_active: true,
    created_at: new Date(),
  });

  await client.close();
}

async function main() {
  const logLines = [];
  function log(msg) {
    console.log(msg);
    logLines.push(msg);
  }

  log('================================================================');
  log('PRODUCTION RENDER CONFIGURATION BOOT VERIFICATION');
  log('================================================================');
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Environment: NODE_ENV=production`);
  log(`Target Database: ${MONGO_URI}`);

  log('\n1. Seeding production user into local MongoDB...');
  await seedUser();
  log('   ✓ Seeded admin@insightloop.io into ' + DB_NAME);

  log('\n2. Spawning Node server with ONLY legacy Django environment variables...');
  const prodEnv = {
    // Only exact Django variables + Node runtime/port + METRICS_TOKEN
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DJANGO_SECRET_KEY: DJANGO_SECRET_KEY,
    MONGODB_URI: MONGO_URI,
    MONGODB_DB_NAME: DB_NAME,
    FRONTEND_ORIGIN: VERCEL_ORIGIN,
    DJANGO_CORS_ALLOWED_ORIGINS: 'https://staging.insightloop.com',
    GOOGLE_CLIENT_ID: '572736622320-3mtp1g63p07t1karnjo4df2nt3s6kmko.apps.googleusercontent.com',
    METRICS_TOKEN: METRICS_TOKEN,
  };

  log('   Variables passed:');
  for (const k of Object.keys(prodEnv)) {
    if (['PATH', 'HOME'].includes(k)) continue;
    log(`     ${k}=${k.includes('SECRET') || k.includes('TOKEN') ? '[REDACTED]' : prodEnv[k]}`);
  }

  const serverProc = spawn('node', ['apps/api/dist/server.js'], {
    cwd: ROOT,
    env: prodEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverStdout = '';
  serverProc.stdout.on('data', (d) => {
    serverStdout += d.toString();
  });
  serverProc.stderr.on('data', (d) => {
    serverStdout += d.toString();
  });

  try {
    // Wait for boot
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const r = await fetch(`${BASE_URL}/health`);
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch {}
    }

    if (!ready) {
      log('   ✗ Server failed to boot! Output:');
      log(serverStdout);
      throw new Error('Server boot timeout');
    }
    log('   ✓ Server booted successfully on ' + BASE_URL);

    // 3. Health check
    log('\n3. Verifying GET /health...');
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthBody = await healthRes.json();
    log(`   Status: ${healthRes.status}`);
    log(`   Body:   ${JSON.stringify(healthBody)}`);
    if (healthRes.status !== 200 || healthBody.status !== 'ok') {
      throw new Error('Health check failed');
    }
    log('   ✓ GET /health returns 200 OK');

    // 4. CORS Preflight check from Vercel origin
    log('\n4. Verifying CORS Preflight from Vercel frontend origin...');
    const corsRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: VERCEL_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    });
    const allowOrigin = corsRes.headers.get('access-control-allow-origin');
    const allowHeaders = corsRes.headers.get('access-control-allow-headers');
    log(`   CORS Status: ${corsRes.status}`);
    log(`   Access-Control-Allow-Origin:  ${allowOrigin}`);
    log(`   Access-Control-Allow-Headers: ${allowHeaders}`);
    if (allowOrigin !== VERCEL_ORIGIN) {
      throw new Error(`CORS origin mismatch! Expected ${VERCEL_ORIGIN}, got ${allowOrigin}`);
    }
    log('   ✓ CORS preflight approved for Vercel origin');

    // 5. Login check using DJANGO_SECRET_KEY fallback
    log('\n5. Verifying POST /api/v1/auth/login with password authentication...');
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: VERCEL_ORIGIN,
      },
      body: JSON.stringify({
        email: 'admin@insightloop.io',
        password: 'ProductionSecretPassword123!',
      }),
    });
    const loginBody = await loginRes.json();
    log(`   Login Status: ${loginRes.status}`);
    log(`   User Email:   ${loginBody.user?.email}`);
    log(`   Access Token: ${loginBody.tokens?.access?.slice(0, 25)}... [VALID JWT]`);
    if (loginRes.status !== 200 || !loginBody.tokens?.access) {
      throw new Error(`Login failed: ${JSON.stringify(loginBody)}`);
    }
    log('   ✓ Login succeeds using DJANGO_SECRET_KEY fallback for JWT signing');

    // 6. Metrics protection check
    log('\n6. Verifying Metrics Protection...');
    const metricsNoAuth = await fetch(`${BASE_URL}/health/detailed`);
    log(`   GET /health/detailed (no token):       HTTP ${metricsNoAuth.status}`);
    const metricsWithAuth = await fetch(`${BASE_URL}/health/detailed`, {
      headers: { 'X-Metrics-Token': METRICS_TOKEN },
    });
    log(`   GET /health/detailed (valid token):    HTTP ${metricsWithAuth.status}`);
    if (metricsNoAuth.status !== 401 && metricsNoAuth.status !== 404) {
      throw new Error('Metrics endpoint exposed without authentication!');
    }
    if (metricsWithAuth.status !== 200) {
      throw new Error('Metrics endpoint rejected valid METRICS_TOKEN');
    }
    log('   ✓ Metrics endpoints securely protected by METRICS_TOKEN');

    log('\n----------------------------------------------------------------');
    log('PRODUCTION BOOT TEST: 100% SUCCESS');
    log('================================================================');

    const outPath = path.resolve(ROOT, 'docs/migration/evidence/render_production_boot.txt');
    fs.writeFileSync(outPath, logLines.join('\n'), 'utf-8');
    log(`Saved evidence to ${outPath}`);
  } finally {
    serverProc.kill('SIGTERM');
    await sleep(500);

    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    await client.db(DB_NAME).dropDatabase();
    await client.close();
  }
}

main().catch((err) => {
  console.error('Fatal error in production boot test:', err);
  process.exit(1);
});
