import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/server.ts',
        'src/types/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        'src/modules/auth/auth.service.ts': { branches: 90 },
        'src/modules/inventory/inventory.service.ts': { branches: 90 },
        'src/modules/workers/workers.service.ts': { branches: 89 },
        'src/modules/bills/bills.service.ts': { branches: 79 },
      },
    },
  },
});
