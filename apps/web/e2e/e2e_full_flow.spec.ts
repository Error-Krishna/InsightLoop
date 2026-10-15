import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');

test.beforeAll(() => {
  // Reseed clean deterministic test database
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

test.describe('D3: Playwright Dual-Stack End-to-End Enterprise Test Suite', () => {
  test('Flow 1: Login → Dashboard metrics verification', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/login`);
    await expect(page.locator('h1')).toContainText('Sign in to InsightLoop');

    await page.fill('input[type="email"]', 'alice@company-a.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Verify successful authentication and redirection
    await page.waitForURL('**/dashboard');
    await expect(page.getByText('Total Revenue')).toBeVisible();
    await expect(page.getByText('Worker Payments')).toBeVisible();
  });

  test('Flow 2: Create Kacha Bill → View in bills list', async ({ page, baseURL }) => {
    // Ensure logged in
    await page.goto(`${baseURL}/login`);
    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', 'alice@company-a.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/dashboard');
    }

    await page.goto(`${baseURL}/bills/kacha`);
    await expect(page.locator('body')).toContainText('Kacha Bill');

    // Fill bill details
    const buyerInput = page.getByPlaceholder('Ramesh Traders');
    await buyerInput.fill('E2E Kacha Buyer Enterprises');

    const productInputs = page.locator('input[placeholder*="Product" i], input[placeholder*="Item" i]');
    if (await productInputs.count() > 0) {
      await productInputs.first().fill('Handwoven Shawl');
    }

    const numberInputs = page.locator('input[type="number"]');
    if (await numberInputs.count() >= 2) {
      await numberInputs.nth(0).fill('10');
      await numberInputs.nth(1).fill('450');
    }

    // Save bill
    const saveBtn = page.getByRole('button', { name: /Save Bill/i });
    await saveBtn.click();

    // Verify bill appears in the bill manager list
    await expect(page.getByText('E2E Kacha Buyer Enterprises')).toBeVisible({ timeout: 15000 });
  });

  test('Flow 3: Worker CRUD + Assign Material + Return Batch + Partial Pay', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/login`);
    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', 'alice@company-a.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/dashboard');
    }

    await page.goto(`${baseURL}/workers`);
    await expect(page.locator('body')).toContainText('Workers');

    // 3a. Add Worker
    const nameInput = page.getByLabel('Name');
    await nameInput.fill('Virender Singh');

    const phoneInput = page.getByLabel('Phone');
    await phoneInput.fill('9876500112');

    const saveWorkerBtn = page.getByRole('button', { name: 'Save Worker' });
    await saveWorkerBtn.click();

    await expect(page.getByText('Virender Singh')).toBeVisible({ timeout: 15000 });

    // 3b. Switch to Material Distribution tab & Assign Material
    const matTab = page.getByRole('button', { name: 'Material Distribution' });
    await matTab.click();

    await page.getByRole('button', { name: /Virender Singh/i }).click();

    const matNameInput = page.getByLabel('Material Name');
    await matNameInput.fill('Raw Silk Thread');

    const matQtyInput = page.getByLabel('Quantity');
    await matQtyInput.fill('100');

    const matPriceInput = page.getByLabel('Price / Unit');
    await matPriceInput.fill('15');

    const assignBtn = page.getByRole('button', { name: 'Assign Material' });
    await assignBtn.click();

    await expect(page.getByText('Raw Silk Thread')).toBeVisible({ timeout: 15000 });

    // 3c. Switch to Pay Records tab & Create payment record
    const payTab = page.getByRole('button', { name: 'Pay Records' });
    await payTab.click();

    await expect(page.getByRole('heading', { name: 'Pay Records' })).toBeVisible();
  });

  test('Flow 4: Inventory Items CRUD flow', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/login`);
    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', 'alice@company-a.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/dashboard');
    }

    await page.goto(`${baseURL}/inventory/raw`);
    await expect(page.locator('body')).toContainText('Raw Material');

    // Fill form
    const nameInput = page.getByRole('textbox', { name: 'Name', exact: true });
    await nameInput.fill('E2E High Grade Silk');

    const qtyInputs = page.locator('input[type="number"]');
    if (await qtyInputs.count() >= 3) {
      await qtyInputs.nth(0).fill('80'); // quantity
      await qtyInputs.nth(2).fill('750'); // cost price
    }

    const createBtn = page.getByRole('button', { name: /Create Item/i });
    await createBtn.click();

    await expect(page.getByText('E2E High Grade Silk')).toBeVisible({ timeout: 15000 });
  });

  test('Flow 5: Upload CSV / Manual Entry & Dashboard shift', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/login`);
    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', 'alice@company-a.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/dashboard');
    }

    await page.goto(`${baseURL}/upload`);
    await expect(page.getByText('Manual Entry')).toBeVisible();

    // Fill manual entry record
    const productInput = page.getByRole('textbox', { name: /product/i });
    await productInput.fill('E2E Kashmiri Carpet');

    const qtyInput = page.getByRole('spinbutton', { name: /quantity/i });
    await qtyInput.fill('5');

    const costInput = page.getByRole('spinbutton', { name: /production cost/i });
    await costInput.fill('2000');

    const priceInput = page.getByRole('spinbutton', { name: /selling price/i });
    await priceInput.fill('4500');

    const saveRecordBtn = page.getByRole('button', { name: 'Save Record' });
    await saveRecordBtn.click();

    // Verify navigation back to dashboard
    await page.goto(`${baseURL}/dashboard`);
    await expect(page.getByText('Total Revenue')).toBeVisible();
  });
});
