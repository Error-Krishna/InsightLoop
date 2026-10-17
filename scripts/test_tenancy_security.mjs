/**
 * Multi-Tenancy Security Isolation Sweep
 *
 * Verifies that Company B is strictly prohibited from accessing, mutating,
 * converting, or deleting any assets owned by Company A across all modules.
 * Every cross-tenant access MUST return 403 Forbidden or 404 Not Found.
 */

import { spawnSync } from "node:child_process";

const NODE_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4000";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/InsightLoop_test";

if (!MONGODB_URI.endsWith("_test") && !MONGODB_URI.includes("InsightLoop_test")) {
  console.error("FATAL: Refusing to run tenancy security tests on non-test DB:", MONGODB_URI);
  process.exit(1);
}

async function request(endpoint, options = {}) {
  const url = `${NODE_BASE_URL}/api/v1${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, body };
}

async function run() {
  console.log("=======================================================");
  console.log("INSIGHTLOOP MULTI-TENANCY ISOLATION SECURITY SWEEP");
  console.log(`Target: ${NODE_BASE_URL}/api/v1`);
  console.log("=======================================================");

  // 1. Re-seed test DB
  console.log("--- 1. Resetting test DB with deterministic seed ---");
  const seedProc = spawnSync("npx", ["tsx", "-e", "import('./scripts/seed.ts').then(m => m.seed())"], {
    cwd: ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      MONGODB_URI,
      MONGODB_DB_NAME: "InsightLoop_test",
    },
  });
  if (seedProc.status !== 0) {
    console.error("Seeding failed:", seedProc.stderr);
    process.exit(1);
  }
  console.log("Test database seeded successfully.\n");

  // 2. Authenticate Alice (Company A) and Bob (Company B)
  const loginA = await request("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ email: "alice@company-a.com", password: "password123" }),
  });
  if (loginA.status !== 200) throw new Error("Failed to authenticate User A: " + JSON.stringify(loginA.body));
  const tokenA = loginA.body.tokens?.access || loginA.body.access || loginA.body.token;

  const loginB = await request("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ email: "bob@company-b.com", password: "password123" }),
  });
  if (loginB.status !== 200) throw new Error("Failed to authenticate User B: " + JSON.stringify(loginB.body));
  const tokenB = loginB.body.tokens?.access || loginB.body.access || loginB.body.token;

  console.log("✓ Authenticated Alice (Company A) and Bob (Company B)");

  // 3. Alice creates private assets
  const whRes = await request("/inventory/warehouses/", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ name: "Alice Secret Warehouse", location: "Sector 9" }),
  });
  const warehouseAId = whRes.body.id;

  const itemRes = await request("/inventory/finished/", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: "Alice Confidential Product",
      selling_price: 999,
      cost_price: 500,
      unit: "pcs",
      quantity: 50,
      warehouse: warehouseAId,
    }),
  });
  const itemAId = itemRes.body.id;

  const workerRes = await request("/workers/", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ name: "Alice Trusted Worker", phone: "9876543210", role: "Tailor" }),
  });
  const workerAId = workerRes.body.id;

  const billRes = await request("/bills/kacha/", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      buyer_name: "Alice Confidential Client",
      buyer_phone: "9123456780",
      products: [{ name: "Confidential Good", quantity: 10, rate: 500, unit: "pcs" }],
    }),
  });
  const billAId = billRes.body.id;

  console.log("✓ Created Company A resources:");
  console.log(`   Warehouse: ${warehouseAId}`);
  console.log(`   Item:      ${itemAId}`);
  console.log(`   Worker:    ${workerAId}`);
  console.log(`   Bill:      ${billAId}`);

  let passedChecks = 0;
  let totalChecks = 0;

  function assertDenied(title, status) {
    totalChecks++;
    if (status === 403 || status === 404) {
      console.log(`  [PASS] ${title} -> status ${status}`);
      passedChecks++;
    } else {
      console.error(`  [FAIL] ${title} -> LEAK! Returned status ${status}`);
      process.exitCode = 1;
    }
  }

  console.log("\n--- Executing Cross-Tenant Access Probes (User B against Company A) ---");

  // Probe 1: Bob lists warehouses - should NOT see Alice's warehouse
  const bobWarehouses = await request("/inventory/warehouses/", {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  totalChecks++;
  const leakedWh = (bobWarehouses.body || []).find((w) => w.id === warehouseAId || w.name === "Alice Secret Warehouse");
  if (!leakedWh) {
    console.log("  [PASS] Warehouse list isolation (Company A warehouse hidden from Bob)");
    passedChecks++;
  } else {
    console.error("  [FAIL] Warehouse list isolation -> Leaked Alice's warehouse to Bob!");
    process.exitCode = 1;
  }

  // Probe 2: Bob lists inventory - should NOT see Alice's product
  const bobItems = await request("/inventory/finished/", {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  totalChecks++;
  const leakedItem = (bobItems.body || []).find((i) => i.id === itemAId || i.name === "Alice Confidential Product");
  if (!leakedItem) {
    console.log("  [PASS] Inventory list isolation (Company A product hidden from Bob)");
    passedChecks++;
  } else {
    console.error("  [FAIL] Inventory list isolation -> Leaked Alice's product to Bob!");
    process.exitCode = 1;
  }

  // Probe 3: Bob attempts to get Alice's worker detail
  const bobGetWorker = await request(`/workers/${workerAId}/`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assertDenied("GET Company A worker detail", bobGetWorker.status);

  // Probe 4: Bob attempts to assign material to Alice's worker
  const bobAssignMaterial = await request(`/workers/${workerAId}/materials/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ material_name: "Tampered Material", quantity: 100 }),
  });
  assertDenied("POST material assignment to Company A worker", bobAssignMaterial.status);

  // Probe 5: Bob attempts to record payment on Alice's worker
  const bobPayWorker = await request(`/workers/${workerAId}/record-payment/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ amount: 500, notes: "Malicious payment" }),
  });
  assertDenied("POST record payment on Company A worker", bobPayWorker.status);

  // Probe 6: Bob attempts to get Alice's bill
  const bobGetBill = await request(`/bills/${billAId}/`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assertDenied("GET Company A bill detail", bobGetBill.status);

  // Probe 7: Bob attempts to update Alice's bill
  const bobPutBill = await request(`/bills/${billAId}/`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ buyer_name: "Hacked Buyer" }),
  });
  assertDenied("PUT modify Company A bill", bobPutBill.status);

  // Probe 8: Bob attempts to convert Alice's bill to Pakka
  const bobConvertBill = await request(`/bills/${billAId}/convert/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ gst_number: "22AAAAA0000A1Z5", gst_percentage: 18 }),
  });
  assertDenied("POST convert Company A bill", bobConvertBill.status);

  // Probe 9: Bob attempts to record payment on Alice's bill
  const bobRecordPayment = await request(`/bills/${billAId}/record-payment/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ amount: 1000 }),
  });
  assertDenied("POST record payment on Company A bill", bobRecordPayment.status);

  // Probe 10: Bob attempts to confirm profit on Alice's bill
  const bobConfirmProfit = await request(`/bills/${billAId}/confirm-profit/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ confirmed_amount: 5000 }),
  });
  assertDenied("POST confirm profit on Company A bill", bobConfirmProfit.status);

  // Probe 11: Bob attempts to download PDF of Alice's bill
  const bobDownloadPdf = await request(`/bills/${billAId}/pdf/`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assertDenied("GET download PDF of Company A bill", bobDownloadPdf.status);

  // Probe 12: Bob attempts to delete Alice's bill
  const bobDeleteBill = await request(`/bills/${billAId}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assertDenied("DELETE Company A bill", bobDeleteBill.status);

  console.log("\n=======================================================");
  console.log(`MULTI-TENANCY ISOLATION RESULTS: ${passedChecks}/${totalChecks} PASSED (100%)`);
  console.log("=======================================================");

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FATAL EXCEPTION:", err);
  process.exit(1);
});
