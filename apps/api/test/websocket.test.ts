import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { setupWebSocketGateway, closeWebSockets, wsEvents } from '../src/ws/gateway.js';
import { env } from '../src/config/env.js';

describe('WebSocket Gateway Suite: Auth, Scoping & Close Codes', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    await setupTestDb();
    server = createServer(app);
    setupWebSocketGateway(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    closeWebSockets();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('closes with code 4001 when token query parameter is missing', async () => {
    const user = await createTestUser();
    const wsUrl = `ws://127.0.0.1:${port}/ws/dashboard/${user.companyId}/`;

    const ws = new WebSocket(wsUrl);

    const closeEvent = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    expect(closeEvent.code).toBe(4001);
    expect(closeEvent.reason).toBe('Authentication token required');
  });

  it('closes with code 4001 when token is invalid or corrupted', async () => {
    const user = await createTestUser();
    const wsUrl = `ws://127.0.0.1:${port}/ws/dashboard/${user.companyId}/?token=gibberish.invalid.jwt`;

    const ws = new WebSocket(wsUrl);

    const closeEvent = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    expect(closeEvent.code).toBe(4001);
    expect(closeEvent.reason).toBe('Invalid token');
  });

  it('closes with code 4002 when token is expired', async () => {
    const user = await createTestUser();

    // Sign an already expired token
    const expiredToken = jwt.sign(
      {
        token_type: 'access',
        user_id: user.userId,
        email: user.email,
        company_id: user.companyId,
        name: 'Test Expired',
      },
      env.JWT_SECRET,
      { expiresIn: -10 }
    );

    const wsUrl = `ws://127.0.0.1:${port}/ws/dashboard/${user.companyId}/?token=${expiredToken}`;
    const ws = new WebSocket(wsUrl);

    const closeEvent = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    expect(closeEvent.code).toBe(4002);
    expect(closeEvent.reason).toBe('Token expired');
  });

  it('authenticates valid token, delivers initial snapshot, and strictly scopes real-time events to tenant', async () => {
    const userA = await createTestUser({ email: 'ws_tenant_a@example.com' });
    const userB = await createTestUser({ email: 'ws_tenant_b@example.com' });

    const wsUrlA = `ws://127.0.0.1:${port}/ws/dashboard/${userA.companyId}/?token=${userA.token}`;
    const wsUrlB = `ws://127.0.0.1:${port}/ws/dashboard/${userB.companyId}/?token=${userB.token}`;

    const wsA = new WebSocket(wsUrlA);
    const pSnapshotA = new Promise<string>((resolve) => wsA.once('message', (d) => resolve(d.toString())));

    const wsB = new WebSocket(wsUrlB);
    const pSnapshotB = new Promise<string>((resolve) => wsB.once('message', (d) => resolve(d.toString())));

    const [snapshotA, snapshotB] = await Promise.all([pSnapshotA, pSnapshotB]);

    expect(JSON.parse(snapshotA)).toBeDefined();
    expect(JSON.parse(snapshotB)).toBeDefined();

    // Now test tenant event scoping: emit update for tenant A
    const messagesA: string[] = [];
    const messagesB: string[] = [];

    wsA.on('message', (d) => messagesA.push(d.toString()));
    wsB.on('message', (d) => messagesB.push(d.toString()));

    wsEvents.emit('dashboard.update', {
      companyId: userA.companyId,
      data: { notification: 'Exclusive Tenant A Alert' },
    });

    // Allow event loop cycle
    await new Promise((r) => setTimeout(r, 100));

    // Tenant A client MUST receive the update
    expect(messagesA.some((m) => m.includes('Exclusive Tenant A Alert'))).toBe(true);

    // Tenant B client MUST NOT receive Tenant A's message
    expect(messagesB.some((m) => m.includes('Exclusive Tenant A Alert'))).toBe(false);

    wsA.close();
    wsB.close();
  });

  it('connects to /ws/ai-assistant/ and processes real-time commands', async () => {
    const user = await createTestUser();
    const wsUrl = `ws://127.0.0.1:${port}/ws/ai-assistant/?token=${user.token}`;

    const ws = new WebSocket(wsUrl);

    // Initial status frame
    const statusMsg = await new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
    const status = JSON.parse(statusMsg);
    expect(status.type).toBe('session_status');
    expect(status.authenticated).toBe(true);

    // Send AI command
    const pResponse = new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
    ws.send(JSON.stringify({ command: 'go to dashboard' }));

    const responseMsg = await pResponse;
    const response = JSON.parse(responseMsg);
    expect(response.action).toBe('navigate');
    expect(response.url).toBe('/dashboard');

    ws.close();
  });

  it('supports deferred first-message authentication on /ws/ai-assistant/', async () => {
    const user = await createTestUser();
    const wsUrl = `ws://127.0.0.1:${port}/ws/ai-assistant/`;

    const ws = new WebSocket(wsUrl);

    // Initial unauthenticated status
    const statusMsg = await new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
    const status = JSON.parse(statusMsg);
    expect(status.type).toBe('session_status');
    expect(status.authenticated).toBe(false);

    // Send command without auth -> error
    const pErr = new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
    ws.send(JSON.stringify({ command: 'help' }));
    const err = JSON.parse(await pErr);
    expect(err.content).toContain('Authentication required');

    // Authenticate with valid token in message
    const pAuth = new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
    ws.send(JSON.stringify({ token: user.token }));
    const authStatus = JSON.parse(await pAuth);
    expect(authStatus.authenticated).toBe(true);

    ws.close();
  });
});
