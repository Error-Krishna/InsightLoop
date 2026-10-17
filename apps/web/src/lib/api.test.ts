// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock localStorage and window for node environment
const store = new Map<string, string>();
(globalThis as unknown as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};

const replaceMock = vi.fn();
(globalThis as unknown as Record<string, unknown>).window = {
  location: {
    pathname: '/dashboard',
    search: '?tab=overview',
    replace: replaceMock,
    href: 'http://localhost:5173/dashboard?tab=overview',
  },
};

import api from './api';
import * as auth from './auth';

let refreshShouldFail = false;

const server = setupServer(
  http.get('*test-protected*', () => {
    return HttpResponse.json({ detail: 'Token expired' }, { status: 401 });
  }),

  http.post('*auth/refresh*', () => {
    if (refreshShouldFail) {
      return HttpResponse.json({ detail: 'Refresh token invalid' }, { status: 401 });
    }
    return HttpResponse.json({ access: 'new-valid-token' });
  })
);

describe('apps/web api.ts Client Hardening', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());

  beforeEach(() => {
    server.resetHandlers();
    store.clear();
    replaceMock.mockClear();
    refreshShouldFail = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects to /login via window.location.replace with next param when no refresh token exists', async () => {
    vi.spyOn(auth, 'getRefreshToken').mockReturnValue(null);
    const clearSpy = vi.spyOn(auth, 'clearSession');

    await expect(api.get('/test-protected')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(clearSpy).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fdashboard%3Ftab%3Doverview');
  });

  it('redirects to /login via replace with next param when refresh token request fails', async () => {
    vi.spyOn(auth, 'getRefreshToken').mockReturnValue('bad-refresh-token');
    refreshShouldFail = true;
    const clearSpy = vi.spyOn(auth, 'clearSession');

    await expect(api.get('/test-protected')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(clearSpy).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fdashboard%3Ftab%3Doverview');
  });
});
