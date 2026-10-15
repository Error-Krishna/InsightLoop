import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.WEB_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'off',
    headless: true,
  },
  webServer: {
    command: 'pnpm preview --port 5173 --host 127.0.0.1',
    port: 5173,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
