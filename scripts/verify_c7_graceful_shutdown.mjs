import { spawn } from 'node:child_process';
import http from 'node:http';
import WebSocket from '../apps/api/node_modules/ws/index.js';

const PORT = 4005;
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(PORT),
  HOST: '127.0.0.1',
  MONGODB_URI: 'mongodb://localhost:27017/InsightLoop_test',
  MONGODB_DB_NAME: 'InsightLoop_test',
  JWT_SECRET: 'test-secret-key-must-be-long-enough-32-chars',
};

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHealth() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function login() {
  const payload = JSON.stringify({ email: 'alice@company-a.com', password: 'password123' });
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${PORT}/api/v1/auth/login/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          const json = JSON.parse(data);
          resolve(json.tokens?.access || json.access);
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('=== C7 DOCKER & GRACEFUL SHUTDOWN VERIFICATION ===');
  console.log(`Starting Node API server on port ${PORT}...`);

  const proc = spawn('node', ['apps/api/dist/server.js'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let logs = '';
  proc.stdout.on('data', (d) => { logs += d.toString(); });
  proc.stderr.on('data', (d) => { logs += d.toString(); });

  let ready = false;
  for (let i = 0; i < 20; i++) {
    await wait(300);
    try {
      const h = await checkHealth();
      if (h.status === 200) {
        ready = true;
        console.log(`[PASS] Server is listening and healthy: ${h.body.trim()}`);
        break;
      }
    } catch {
      // waiting
    }
  }

  if (!ready) {
    console.error('Server failed to start in time. Logs:\n', logs);
    proc.kill('SIGKILL');
    process.exit(1);
  }

  // Get token and connect WebSocket
  const token = await login();
  console.log('Connecting authenticated WebSocket to /ws/dashboard/?token=...');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/dashboard/?token=${token}`);
  let wsClosedWith1001 = false;
  let wsCloseReason = '';

  ws.on('close', (code, reason) => {
    console.log(`WebSocket closed: code = ${code}, reason = "${reason.toString()}"`);
    if (code === 1001) {
      wsClosedWith1001 = true;
      wsCloseReason = reason.toString();
    }
  });

  await new Promise((resolve) => {
    ws.on('open', () => {
      console.log('[PASS] WebSocket connected successfully.');
      resolve();
    });
    ws.on('error', (err) => {
      console.log('WS error (proceeding):', err.message);
      resolve();
    });
  });

  console.log('Sending SIGTERM to process (PID ' + proc.pid + ')...');
  proc.kill('SIGTERM');

  const exitCode = await new Promise((resolve) => {
    proc.on('exit', (code) => {
      resolve(code);
    });
  });

  console.log(`Server exited with code ${exitCode}.`);
  console.log('--- Server Shutdown Logs ---');
  console.log(logs.trim());
  console.log('----------------------------');

  const assertions = [
    { name: 'Exit code is 0', pass: exitCode === 0 },
    { name: 'Logs show "Graceful shutdown initiated"', pass: logs.includes('Graceful shutdown initiated') },
    { name: 'Logs show "HTTP server closed"', pass: logs.includes('HTTP server closed') },
    { name: 'Logs show "MongoDB connection closed"', pass: logs.includes('MongoDB connection closed') },
    { name: 'Logs show "Redis connection closed"', pass: logs.includes('Redis connection closed') },
    { name: 'Logs show "Graceful shutdown completed successfully"', pass: logs.includes('Graceful shutdown completed successfully') },
    { name: 'WebSocket received 1001 "Going Away"', pass: wsClosedWith1001 },
  ];

  let allPassed = true;
  for (const a of assertions) {
    if (a.pass) {
      console.log(`[PASS] ${a.name}`);
    } else {
      console.log(`[FAIL] ${a.name}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('\nC7 VERIFICATION FAILED');
    process.exit(1);
  }

  console.log('\n=== C7 VERIFICATION PASSED (ALL ASSERTIONS SATISFIED) ===');
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
