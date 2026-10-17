import { spawn, execSync } from 'node:child_process';

const DEMO_DB_NAME = 'InsightLoop_phase6_boot_demo';
const MONGODB_URI = `mongodb://localhost:27017/${DEMO_DB_NAME}`;
const FRONTEND_ORIGIN = 'https://insightloop.vercel.app';
const CORS_ORIGIN = 'https://insightloop.vercel.app';
const METRICS_TOKEN = 'demo-metrics-token-must-be-kept-secret-32-char';
const JWT_SECRET = 'supersecretjwtkeythatisatleast32characterslong12345';
const GOOGLE_CLIENT_ID = '572736622320-3mtp1g63p07t1karnjo4df2nt3s6kmko.apps.googleusercontent.com';
const PORT = 4000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function main() {
  console.log('=== TEST 1: Verify refusal to boot without JWT_SECRET in production ===');
  const failProc = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: {
      NODE_ENV: 'production',
      MONGODB_URI,
      MONGODB_DB_NAME: DEMO_DB_NAME,
      CORS_ORIGIN,
      FRONTEND_ORIGIN,
      GOOGLE_CLIENT_ID,
      METRICS_TOKEN,
      EMAIL_HOST_USER: 'dummy@gmail.com',
      EMAIL_HOST_PASSWORD: 'dummy-password',
      PATH: process.env.PATH,
    },
  });

  let failStderr = '';
  failProc.stderr.on('data', (d) => { failStderr += d.toString(); });
  failProc.stdout.on('data', (d) => { failStderr += d.toString(); });

  const failExitCode = await new Promise((resolve) => {
    failProc.on('exit', (code) => resolve(code));
  });

  console.log(`Exit code with missing JWT_SECRET: ${failExitCode}`);
  const hasExpectedMessage = failStderr.includes('JWT_SECRET is required in production');
  console.log(`Printed expected error message: ${hasExpectedMessage}`);
  if (failExitCode !== 1 || !hasExpectedMessage) {
    throw new Error('Server failed to reject missing JWT_SECRET properly');
  }

  console.log('\n=== TEST 2: Boot server with ONLY Render variables ===');
  const serverProc = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: {
      NODE_ENV: 'production',
      MONGODB_URI,
      MONGODB_DB_NAME: DEMO_DB_NAME,
      JWT_SECRET,
      CORS_ORIGIN,
      FRONTEND_ORIGIN,
      GOOGLE_CLIENT_ID,
      METRICS_TOKEN,
      EMAIL_HOST_USER: 'dummy-sender@gmail.com',
      EMAIL_HOST_PASSWORD: 'dummy-app-password',
      PATH: process.env.PATH,
    },
  });

  serverProc.stdout.on('data', (d) => {
    process.stdout.write(`[SERVER STDOUT] ${d}`);
  });
  serverProc.stderr.on('data', (d) => {
    process.stderr.write(`[SERVER STDERR] ${d}`);
  });

  // Wait for server to boot
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
  }

  if (!ready) {
    serverProc.kill('SIGKILL');
    throw new Error('Server failed to boot within 15 seconds');
  }

  console.log('Server booted and healthy!');

  try {
    console.log('\n=== TEST 3: Check GET /health ===');
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthJson = await healthRes.json();
    console.log(`Status: ${healthRes.status}, Body:`, healthJson);

    console.log('\n=== TEST 4: Check GET / (redirects to FRONTEND_ORIGIN) ===');
    const rootRes = await fetch(`${BASE_URL}/`, { redirect: 'manual' });
    console.log(`Status: ${rootRes.status}, Location header: ${rootRes.headers.get('location')}`);

    console.log('\n=== TEST 5: Check CORS header from CORS_ORIGIN ===');
    const corsRes = await fetch(`${BASE_URL}/health`, {
      headers: {
        Origin: CORS_ORIGIN,
      },
    });
    console.log(`Status: ${corsRes.status}, Access-Control-Allow-Origin: ${corsRes.headers.get('access-control-allow-origin')}`);

    console.log('\n=== TEST 6: Check /metrics authentication ===');
    const metricsNoAuth = await fetch(`${BASE_URL}/metrics`);
    console.log(`Without token -> Status: ${metricsNoAuth.status} ${metricsNoAuth.statusText}`);

    const metricsWithAuth = await fetch(`${BASE_URL}/metrics`, {
      headers: {
        'x-metrics-token': METRICS_TOKEN,
      },
    });
    console.log(`With x-metrics-token -> Status: ${metricsWithAuth.status} ${metricsWithAuth.statusText}`);

    console.log('\n=== TEST 7: Signup then Login ===');
    const testEmail = `render_test_${Date.now()}@example.com`;
    const signupRes = await fetch(`${BASE_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Render Tester',
        email: testEmail,
        password: 'Password123!',
        company_name: 'Render Test Corp',
      }),
    });
    const signupJson = await signupRes.json();
    console.log(`Signup Status: ${signupRes.status}, User ID: ${signupJson.user?.id}, Company: ${signupJson.user?.company_name}`);

    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
      }),
    });
    const loginJson = await loginRes.json();
    console.log(`Login Status: ${loginRes.status}, Access token received: ${Boolean(loginJson.tokens?.access)}`);

    console.log('\n=== ALL PRODUCTION BOOT CHECKS PASSED ===');
  } finally {
    console.log('\nShutting down demo server...');
    serverProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1000));

    // Cleanup demo database
    console.log(`Dropping demo database: ${DEMO_DB_NAME}...`);
    try {
      execSync(`mongosh "mongodb://localhost:27017/${DEMO_DB_NAME}" --eval "db.dropDatabase()"`, { stdio: 'ignore' });
    } catch {}
    console.log('Cleanup complete.');
  }
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
