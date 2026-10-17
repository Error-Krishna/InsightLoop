import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { setupWebSocketGateway } from '../src/ws/gateway.js';
import { setupTestDb, getDb, createTestUser } from './testHelper.js';
import { generateTokens } from '../src/utils/jwt.js';

describe('A4: AI WebSocket Tenancy & Live Revocation', () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    await setupTestDb();
    server = http.createServer(app);
    setupWebSocketGateway(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        serverUrl = `ws://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects connection with code 4001 if refresh token is provided instead of access token', async () => {
    const user = await createTestUser();
    const ws = new WebSocket(`${serverUrl}/ws/ai-assistant/?token=${user.refreshToken}`);

    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    expect(closeCode).toBe(4001);
  });

  it('rejects connection with code 4001 if user exists in token claim but was deleted from DB', async () => {
    const user = await createTestUser();
    const db = getDb();
    // Delete user from DB
    await db.collection('user').deleteOne({ email: user.email });

    const ws = new WebSocket(`${serverUrl}/ws/ai-assistant/?token=${user.token}`);
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    expect(closeCode).toBe(4001);
  });

  it('rejects first-message auth with 4001 if user was deleted from DB', async () => {
    const user = await createTestUser();
    const db = getDb();
    await db.collection('user').deleteOne({ email: user.email });

    const ws = new WebSocket(`${serverUrl}/ws/ai-assistant/`);
    await new Promise((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ token: user.token }));

    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    expect(closeCode).toBe(4001);
  });

  it('revokes access mid-session: delete user -> next command rejected and socket closed with 4001', async () => {
    const user = await createTestUser();
    const db = getDb();

    const ws = new WebSocket(`${serverUrl}/ws/ai-assistant/?token=${user.token}`);
    await new Promise((resolve) => ws.on('open', resolve));

    // First command succeeds
    const firstReplyPromise = new Promise<string>((resolve) => {
      ws.on('message', (data) => resolve(data.toString()));
    });
    ws.send(JSON.stringify({ command: 'help' }));
    const firstReply = await firstReplyPromise;
    expect(firstReply).toContain('message');

    // Delete user from DB
    await db.collection('user').deleteOne({ email: user.email });

    // Next command should detect deleted user and close with 4001
    const closePromise = new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    ws.send(JSON.stringify({ command: 'Show me revenue trends' }));

    const code = await closePromise;
    expect(code).toBe(4001);

    // Immediate reconnect is also rejected
    const ws2 = new WebSocket(`${serverUrl}/ws/ai-assistant/?token=${user.token}`);
    const code2 = await new Promise<number>((resolve) => {
      ws2.on('close', (c) => resolve(c));
    });
    expect(code2).toBe(4001);
  });
});
