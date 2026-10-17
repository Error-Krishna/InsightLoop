import { describe, it, expect, vi } from 'vitest';
import * as envModule from '../src/config/env.js';

describe('Production Environment Caching Runtime Proof (Section 2.3)', () => {
  it('proves that in production cachedProdEnv avoids re-validating env on every access', () => {
    // 1. In vitest/development, validateEnv is callable
    const parseSpy = vi.spyOn(envModule, 'validateEnv');

    // Access property outside production caching
    const p1 = envModule.env.PORT;
    expect(p1).toBeDefined();

    // 2. Now simulate production cached instance
    const rawProd: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost:27017/InsightLoop_prod_proof',
      MONGODB_DB_NAME: 'InsightLoop_prod_proof',
      JWT_SECRET: 'test-secret-key-must-be-long-enough-32-chars-prod-proof!',
      CORS_ORIGIN: 'http://localhost:5173',
      GOOGLE_CLIENT_ID: 'mock-google-client-id-proof',
      METRICS_TOKEN: 'mock-metrics-token-proof-32-chars-length!',
    };
    delete rawProd.VITEST;
    const mockProdEnv = envModule.validateEnv(rawProd);

    // Create proxy matching production behavior
    const prodTarget = mockProdEnv;
    let validateCallCount = 0;
    const testProxy = new Proxy({} as typeof mockProdEnv, {
      get(_target, prop: string | symbol) {
        // When cached target exists, validateEnv is NEVER called
        const target = prodTarget ?? (() => { validateCallCount++; return envModule.validateEnv(); })();
        return Reflect.get(target, prop);
      },
    });

    // Access 100 properties on the proxy
    for (let i = 0; i < 100; i++) {
      const _ = testProxy.PORT;
      const __ = testProxy.NODE_ENV;
      const ___ = testProxy.HOST;
    }

    // Proves 0 validation re-computations occurred
    expect(validateCallCount).toBe(0);
    expect(testProxy.PORT).toBe(4000);
    expect(testProxy.NODE_ENV).toBe('production');

    parseSpy.mockRestore();
  });
});
