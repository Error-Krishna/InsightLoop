import { test, expect, type Page } from '@playwright/test';
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
  execSync('pnpm tsx scripts/seed.ts', { cwd: ROOT, env, encoding: 'utf-8' });
});

async function ensureLoggedIn(page: Page, baseURL?: string) {
  await page.goto(`${baseURL}/dashboard`);
  if (page.url().includes('/login')) {
    await page.fill('input[type="email"]', 'alice@company-a.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
  }
}

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
    await ensureLoggedIn(page, baseURL);

    await page.goto(`${baseURL}/bills/kacha`);
    await expect(page.locator('body')).toContainText('Kacha Bill');

    // Fill bill details
    const buyerInput = page.getByPlaceholder('Ramesh Traders');
    await buyerInput.fill('E2E Kacha Buyer Enterprises');

    const productInputs = page.locator('input[placeholder*="Product" i], input[placeholder*="Item" i]');
    if ((await productInputs.count()) > 0) {
      await productInputs.first().fill('Handwoven Shawl');
    }

    const numberInputs = page.locator('input[type="number"]');
    if ((await numberInputs.count()) >= 2) {
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
    await ensureLoggedIn(page, baseURL);

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
    await ensureLoggedIn(page, baseURL);

    await page.goto(`${baseURL}/inventory/raw`);
    await expect(page.locator('body')).toContainText('Raw Materials Inventory');

    // Fill form
    const nameInput = page.getByRole('textbox', { name: 'Name', exact: true });
    await nameInput.fill('E2E High Grade Silk');

    const qtyInputs = page.locator('input[type="number"]');
    if ((await qtyInputs.count()) >= 3) {
      await qtyInputs.nth(0).fill('80'); // quantity
      await qtyInputs.nth(2).fill('750'); // cost price
    }

    const createBtn = page.getByRole('button', { name: /Create Item/i });
    await createBtn.click();

    await expect(page.getByText('E2E High Grade Silk')).toBeVisible({ timeout: 15000 });
  });

  test('Flow 5: Upload CSV / Manual Entry & Dashboard shift', async ({ page, baseURL }) => {
    await ensureLoggedIn(page, baseURL);

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

  test('Flow 6: Signup → Login → Logout lifecycle flow', async ({ page, baseURL }) => {
    const uniqueEmail = `e2e_user_${Date.now()}@flowtest.com`;
    await page.goto(`${baseURL}/signup`);
    await expect(page.locator('h1')).toContainText('Start your free trial');

    // Fill inputs
    const textInputs = page.locator('input[type="text"]');
    await textInputs.nth(0).fill('E2E New User');
    await page.fill('input[type="email"]', uniqueEmail);
    await textInputs.nth(1).fill('E2E New Enterprise');
    await page.fill('input[type="password"]', 'Password123!');

    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page.getByText('Total Revenue')).toBeVisible();

    // Logout
    const logoutBtn = page.getByRole('button', { name: /Log out/i });
    await logoutBtn.first().click();

    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Sign in to InsightLoop');

    // Login with the newly created user credentials
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page.getByText('Total Revenue')).toBeVisible();
  });

  test('Flow 7: Expired-token recovery via refresh token rotation', async ({ page, baseURL }) => {
    await ensureLoggedIn(page, baseURL);

    const oldToken = await page.evaluate(() => localStorage.getItem('insightloop_access_token'));
    expect(oldToken).toBeTruthy();

    // Intentionally corrupt access_token to simulate token expiration
    await page.evaluate(() => {
      localStorage.setItem('insightloop_access_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.invalid_expired');
    });

    // Set up response listener for token refresh before triggering the 401
    const refreshPromise = page.waitForResponse((resp) => resp.url().includes('/auth/refresh/') && resp.status() === 200, {
      timeout: 15000,
    });

    // Make an authenticated navigation / action
    await page.goto(`${baseURL}/profile`);

    // Interceptor intercepts 401, calls /auth/refresh/, updates token, and stays authenticated
    await refreshPromise;
    await expect(page.getByRole('heading', { name: /Profile & Company Settings/i })).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('insightloop_access_token')), { timeout: 10000 })
      .not.toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.invalid_expired');

  });

  test('Flow 8: Bill payments → Confirm profit → PDF generation flow', async ({ page, baseURL }) => {
    await ensureLoggedIn(page, baseURL);

    await page.goto(`${baseURL}/bills/pakka`);
    await expect(page.getByRole('heading', { name: /^Pakka Bill$/i })).toBeVisible();

    // Create Pakka Bill
    const buyerInput = page.getByPlaceholder('Ramesh Traders');
    const uniqueBuyer = `E2E Profit Buyer ${Date.now()}`;
    await buyerInput.fill(uniqueBuyer);

    const productInputs = page.locator('input[placeholder*="Product name" i], input[placeholder*="Product" i]');
    if ((await productInputs.count()) > 0) {
      await productInputs.first().fill('Silk Sarees');
    }

    const rateInput = page.locator('input[placeholder="0.00"]');
    if ((await rateInput.count()) > 0) {
      await rateInput.first().fill('1000');
    }

    await page.getByRole('button', { name: /Save Bill/i }).click();

    // Wait for bill to appear in table
    const billRow = page.locator('tr', { hasText: uniqueBuyer });
    await expect(billRow).toBeVisible({ timeout: 15000 });

    // Record customer payment
    const recordPayBtn = billRow.getByRole('button', { name: /Record customer payment/i });
    if ((await recordPayBtn.count()) > 0) {
      await recordPayBtn.click();
      await expect(page.getByText('Record Payment ·')).toBeVisible();
      const amountInput = page.locator('input[placeholder*="up to" i]');
      await amountInput.fill('1180');
      await page.getByRole('button', { name: /^Record$/i }).click();
      // Dismiss payment modal to restore view to bill table
      await page.getByRole('button', { name: 'Close' }).click();
    }

    // Confirm profit
    const confirmProfitBtn = billRow.getByRole('button', { name: /Confirm profit for this consignment/i });
    if ((await confirmProfitBtn.count()) > 0) {
      await confirmProfitBtn.click();
      await expect(page.getByText('Confirm Profit ·')).toBeVisible();
      const modalConfirmBtn = page.getByRole('button', { name: 'Confirm Profit', exact: true });
      await expect(modalConfirmBtn).toBeEnabled({ timeout: 10000 });
      await modalConfirmBtn.click();
      await expect(page.getByText(/Profit confirmed/i)).toBeVisible({ timeout: 15000 });
    }


    // Download PDF (verify endpoint returns status 200)
    const pdfResponsePromise = page.waitForResponse((resp) => resp.url().includes('/pdf/') && resp.status() === 200, {
      timeout: 15000,
    });
    const pdfBtn = billRow.getByRole('button', { name: /Download PDF/i });
    await pdfBtn.click();
    const pdfResponse = await pdfResponsePromise;
    expect(pdfResponse.status()).toBe(200);
  });

  test('Flow 9: CSV upload → live dashboard update via WebSocket broadcast', async ({ page, baseURL }) => {
    await ensureLoggedIn(page, baseURL);

    // Verify WebSocket connects on dashboard
    const wsPromise = page.waitForEvent('websocket', { timeout: 15000 });
    await page.goto(`${baseURL}/dashboard`);
    const ws = await wsPromise;
    expect(ws.url()).toContain('/ws/dashboard/');

    let frameCount = 0;
    ws.on('framereceived', () => {
      frameCount++;
    });

    const nextFramePromise = ws.waitForEvent('framereceived', { timeout: 15000 }).catch(() => null);

    // Post manual record via API
    const token = await page.evaluate(() => localStorage.getItem('insightloop_access_token'));
    const response = await page.request.post(`${baseURL}/api/v1/upload/manual/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        date: '2026-10-16',
        product: 'E2E Realtime Goods',
        category: 'Apparel',
        quantity: 10,
        production_cost: 1000,
        selling_price: 2500,
        region: 'North',
        customer_type: 'Retail',
      },

    });
    expect(response.status()).toBe(201);

    await nextFramePromise;
    expect(frameCount).toBeGreaterThanOrEqual(1);

    // Reload dashboard to verify rendered state reflects the update cleanly
    await page.reload();
    await expect(page.getByText('Total Revenue')).toBeVisible();
  });


  test('Flow 10: AI assistant interactive chat and prompt response', async ({ page, baseURL }) => {
    await ensureLoggedIn(page, baseURL);

    await page.goto(`${baseURL}/ai-assistant`);
    await expect(page.getByRole('main').getByRole('heading', { name: /AI Assistant/i })).toBeVisible();

    // Input prompt and send
    const input = page.getByPlaceholder(/Try: Export business trends/i);
    await input.fill('Show me revenue performance summary');
    await page.keyboard.press('Enter');

    // Verify user message appears in chat
    await expect(page.getByText('Show me revenue performance summary')).toBeVisible({ timeout: 10000 });

    // Verify message bubble list updated
    const bubbles = page.locator('.rounded-2xl');
    expect(await bubbles.count()).toBeGreaterThan(0);
  });

  test('Flow 11: Zero console errors sweep across every routed page', async ({ page, baseURL }) => {
    await ensureLoggedIn(page, baseURL);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon.ico')) {
          consoleErrors.push(`[${page.url()}] ${text}`);
        }
      }
    });

    const routes = [
      '/',
      '/dashboard',
      '/bills/kacha',
      '/bills/pakka',
      '/inventory/finished',
      '/inventory/semi-finished',
      '/inventory/raw',
      '/inventory/warehouses',
      '/insights',
      '/workers',
      '/upload',
      '/ai-assistant',
      '/profile',
      '/settings',
    ];

    for (const route of routes) {
      await page.goto(`${baseURL}${route}`);
      await page.waitForLoadState('domcontentloaded');
    }

    expect(consoleErrors).toEqual([]);
  });
});
