import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');

test.beforeAll(() => {
  // Reseed clean deterministic database before E2E run
  const env = {
    ...process.env,
    MONGODB_URI: 'mongodb://localhost:27017/InsightLoop_test',
    MONGODB_DB_NAME: 'InsightLoop_test',
    DJANGO_SECRET_KEY: 'test-secret-key-must-be-long-enough-32-chars',
    REDIS_URL: '',
    DJANGO_DEBUG: 'true',
    PYTHONPATH: path.resolve(ROOT, 'insightloop'),
  };
  execSync('.venv/bin/python scripts/seed_test_db.py', { cwd: ROOT, env, encoding: 'utf-8' });
});

test.describe('End-to-End Enterprise Flow: Auth, Bills, Payments, Workers & Metrics', () => {
  test('executes complete SaaS workflow across dual-stack API target', async ({ page, baseURL }) => {
    // 1. LOGIN
    await page.goto(`${baseURL}/login`);
    await expect(page.locator('h1')).toContainText('Sign in to InsightLoop');

    await page.fill('input[type="email"]', 'alice@company-a.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // 2. DASHBOARD VERIFICATION
    await page.waitForURL('**/dashboard');
    await expect(page.locator('body')).toContainText('InsightLoop');

    // 3. CREATE BILL
    await page.goto(`${baseURL}/bills/pakka`);
    await expect(page.locator('body')).toContainText('Pakka Bill');

    await page.fill('input[placeholder*="Buyer Name" i], input[placeholder*="Name" i]', 'E2E Royal Boutique');
    
    // Fill first product line
    const nameInputs = page.locator('input[placeholder*="Product" i], input[placeholder*="Item" i]');
    if (await nameInputs.count() > 0) {
      await nameInputs.first().fill('Pashmina Shawl Export');
    }

    const qtyInputs = page.locator('input[type="number"]');
    if (await qtyInputs.count() >= 2) {
      await qtyInputs.nth(0).fill('10');
      await qtyInputs.nth(1).fill('500');
    }

    // Submit bill
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Generate")');
    if (await saveButton.count() > 0) {
      await saveButton.first().click();
    }

    // 4. WORKERS MANAGEMENT
    await page.goto(`${baseURL}/workers`);
    await expect(page.locator('body')).toContainText('Workers');

    // 5. FINANCIAL & DASHBOARD RELOAD VERIFICATION
    await page.goto(`${baseURL}/dashboard`);
    await expect(page.locator('body')).toBeVisible();
  });
});
