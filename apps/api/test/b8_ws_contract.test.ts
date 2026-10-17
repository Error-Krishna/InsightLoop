import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { setupWebSocketGateway, closeWebSockets, wsEvents } from '../src/ws/gateway.js';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser } from './testHelper.js';
import { env } from '../src/config/env.js';

describe('B8: WebSocket Contract Alignment Suite', () => {
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
    closeWebSockets();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  // (a) Auth query param / header handling: close code must match Django (4001)
  describe('(a) Close code 4001 matching Django', () => {
    it('closes with 4001 when query token is missing on /ws/dashboard/', async () => {
      const user = await createTestUser();
      const ws = new WebSocket(`${serverUrl}/ws/dashboard/${user.companyId}/`);
      const closeCode = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
      expect(closeCode).toBe(4001);
    });

    it('closes with 4001 when token is expired on /ws/dashboard/', async () => {
      const user = await createTestUser();
      const expiredToken = jwt.sign(
        { token_type: 'access', user_id: user.userId, email: user.email, company_id: user.companyId },
        env.JWT_SECRET,
        { expiresIn: -10 }
      );
      const ws = new WebSocket(`${serverUrl}/ws/dashboard/${user.companyId}/?token=${expiredToken}`);
      const closeCode = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
      expect(closeCode).toBe(4001);
    });

    it('closes with 4001 when token is invalid or malformed', async () => {
      const user = await createTestUser();
      const ws = new WebSocket(`${serverUrl}/ws/dashboard/${user.companyId}/?token=bad.token.signature`);
      const closeCode = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
      expect(closeCode).toBe(4001);
    });

    it('accepts valid token via Authorization header on /ws/dashboard/', async () => {
      const user = await createTestUser();
      const ws = new WebSocket(`${serverUrl}/ws/dashboard/${user.companyId}/`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const snapshot = await new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
      expect(JSON.parse(snapshot)).toBeDefined();
      ws.close();
    });

    it('closes with 4001 when trying to access another company dashboard URL (cross-tenant)', async () => {
      const userA = await createTestUser({ email: 'user_a@comp-a.com' });
      const userB = await createTestUser({ email: 'user_b@comp-b.com' });

      // User A token used against User B company ID URL
      const ws = new WebSocket(`${serverUrl}/ws/dashboard/${userB.companyId}/?token=${userA.token}`);
      const closeCode = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
      expect(closeCode).toBe(4001);
    });

    it('closes with 4001 on /ws/ai-assistant/ when token in query param is expired', async () => {
      const user = await createTestUser();
      const expiredToken = jwt.sign(
        { token_type: 'access', user_id: user.userId, email: user.email, company_id: user.companyId },
        env.JWT_SECRET,
        { expiresIn: -10 }
      );
      const ws = new WebSocket(`${serverUrl}/ws/ai-assistant/?token=${expiredToken}`);
      const closeCode = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
      expect(closeCode).toBe(4001);
    });
  });

  // (b) Payload framing alignment matching Django consumers
  describe('(b) Payload framing alignment', () => {
    it('sends session_status framing matching Django AIAssistantConsumer', async () => {
      const user = await createTestUser();
      const ws = new WebSocket(`${serverUrl}/ws/ai-assistant/?token=${user.token}`);

      const frame = await new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
      const parsed = JSON.parse(frame);

      // Django contract: { type: "session_status", authenticated: true, message: "Connected to AI Assistant" }
      expect(parsed.type).toBe('session_status');
      expect(parsed.authenticated).toBe(true);
      expect(parsed.message).toBe('Connected to AI Assistant');
      ws.close();
    });

    it('sends type: "error" framing matching Django on unauthenticated command', async () => {
      const ws = new WebSocket(`${serverUrl}/ws/ai-assistant/`);
      // Consume initial unauthenticated status frame
      await new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));

      // Send command without auth
      ws.send(JSON.stringify({ command: 'help' }));
      const errFrame = await new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
      const parsed = JSON.parse(errFrame);

      expect(parsed.type).toBe('error');
      expect(parsed.content).toMatch(/Authentication required/i);
      ws.close();
    });
  });

  // (c) AI consumer scoping: user-level company check
  describe('(c) AI consumer scoping', () => {
    it('strictly isolates AI execution and real-time streams between tenants', async () => {
      const tenantA = await createTestUser({ email: 'alice_ai@company-a.com' });
      const tenantB = await createTestUser({ email: 'bob_ai@company-b.com' });

      const wsA = new WebSocket(`${serverUrl}/ws/ai-assistant/?token=${tenantA.token}`);
      const wsB = new WebSocket(`${serverUrl}/ws/ai-assistant/?token=${tenantB.token}`);

      // Consume initial status frames
      await Promise.all([
        new Promise<string>((resolve) => wsA.once('message', (d) => resolve(d.toString()))),
        new Promise<string>((resolve) => wsB.once('message', (d) => resolve(d.toString()))),
      ]);

      const messagesA: string[] = [];
      const messagesB: string[] = [];

      wsA.on('message', (d) => messagesA.push(d.toString()));
      wsB.on('message', (d) => messagesB.push(d.toString()));

      // Tenant A issues navigation command
      wsA.send(JSON.stringify({ command: 'go to dashboard' }));

      // Wait for reply
      await new Promise((r) => setTimeout(r, 200));

      expect(messagesA.length).toBeGreaterThan(0);
      const parsedA = JSON.parse(messagesA[0]);
      expect(parsedA.action).toBe('navigate');
      expect(parsedA.url).toBe('/dashboard');

      // Tenant B MUST NOT receive anything from Tenant A's session
      expect(messagesB).toHaveLength(0);

      wsA.close();
      wsB.close();
    });
  });
});
