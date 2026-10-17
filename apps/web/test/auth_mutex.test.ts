// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock localStorage for node environment
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  length: 0,
};

import api from '../src/lib/api';
import { setSession, clearSession, getAccessToken } from '../src/lib/auth';

let refreshCallCount = 0;
let dashboardCallCount = 0;
let billsCallCount = 0;

const server = setupServer(
  // 1. Refresh endpoint
  http.post('*/auth/refresh/*', async () => {
    refreshCallCount++;
    return HttpResponse.json({
      access: 'new-valid-jwt-token',
      refresh: 'new-valid-refresh-token',
    });
  }),

  // 2. Dashboard overview endpoint
  http.get('*/dashboard/overview*', ({ request }) => {
    dashboardCallCount++;
    const auth = request.headers.get('Authorization');
    if (auth !== 'Bearer new-valid-jwt-token') {
      return HttpResponse.json({ detail: 'Token expired' }, { status: 401 });
    }
    return HttpResponse.json({ totalRevenue: 100000 });
  }),

  // 3. Bills list endpoint
  http.get('*/bills*', ({ request }) => {
    billsCallCount++;
    const auth = request.headers.get('Authorization');
    if (auth !== 'Bearer new-valid-jwt-token') {
      return HttpResponse.json({ detail: 'Token expired' }, { status: 401 });
    }
    return HttpResponse.json([{ id: 'bill-1', grand_total: 500 }]);
  })
);

describe('Auth Single-Flight Refresh Mutex Suite', () => {
  beforeEach(() => {
    refreshCallCount = 0;
    dashboardCallCount = 0;
    billsCallCount = 0;
    server.listen();
    setSession({
      access: 'initial-expired-token',
      refresh: 'valid-refresh-token',
      user: { id: 'u1', name: 'Alice', email: 'alice@example.com', company_id: 'c1' },
    });
  });

  afterEach(() => {
    server.close();
    clearSession();
  });

  it('coalesces concurrent 401s into EXACTLY ONE refresh call and replays all callers', async () => {
    // Launch two requests concurrently while holding an expired token
    const [resDashboard, resBills] = await Promise.all([
      api.get('/dashboard/overview'),
      api.get('/bills'),
    ]);

    // 1. Both endpoints must have succeeded with HTTP 200 after replay
    expect(resDashboard.status).toBe(200);
    expect(resDashboard.data).toEqual({ totalRevenue: 100000 });

    expect(resBills.status).toBe(200);
    expect(resBills.data).toEqual([{ id: 'bill-1', grand_total: 500 }]);

    // 2. CRITICAL: The refresh endpoint must have been called EXACTLY ONCE (mutex single-flight)
    expect(refreshCallCount).toBe(1);

    // 3. Initial calls (2) + replayed calls (2) = 4 total requests
    expect(dashboardCallCount).toBe(2);
    expect(billsCallCount).toBe(2);

    // 4. Stored access token must be updated to the new token
    expect(getAccessToken()).toBe('new-valid-jwt-token');
  });
});
