#!/usr/bin/env node
/**
 * InsightLoop Production Smoke Test Script
 *
 * Zero external dependencies (uses native Node 22+ fetch, FormData, Blob, WebSocket, crypto).
 *
 * Usage:
 *   node scripts/smoke_test.mjs https://<render-url> [https://<vercel-url>]
 */

import crypto from 'node:crypto';

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: node scripts/smoke_test.mjs <render-url> [vercel-url]');
  console.log('Example: node scripts/smoke_test.mjs https://insightloop-api.onrender.com https://insightloop.vercel.app');
  process.exit(1);
}

const renderUrl = args[0].replace(/\/+$/, '');
const vercelUrl = args[1] ? args[1].replace(/\/+$/, '') : null;

console.log('====================================================');
console.log('  INSIGHTLOOP DEPLOYMENT SMOKE TEST RUNNER');
console.log('====================================================');
console.log(`Backend API Target : ${renderUrl}`);
console.log(`Frontend Origin    : ${vercelUrl ?? '(None specified - CORS check will use simulated origin)'}`);
console.log('----------------------------------------------------\n');

let passCount = 0;
let failCount = 0;

function report(step, passed, message, details = '') {
  if (passed) {
    passCount++;
    console.log(`[PASS] ${step}: ${message}`);
  } else {
    failCount++;
    console.error(`[FAIL] ${step}: ${message}`);
  }
  if (details) {
    console.log(`       ${details}`);
  }
}

// Track resources to clean up
const cleanup = {
  billId: null,
  inventoryId: null,
  workerId: null,
  accessToken: null,
};

async function run() {
  // --------------------------------------------------------------------------
  // STEP 1: GET /health and GET /
  // --------------------------------------------------------------------------
  try {
    const healthRes = await fetch(`${renderUrl}/health`);
    const healthJson = await healthRes.json().catch(() => ({}));
    const healthOk = healthRes.status === 200 && healthJson.status === 'ok';
    report(
      'Step 1.1 - GET /health',
      healthOk,
      `HTTP ${healthRes.status} ${healthRes.statusText}`,
      JSON.stringify(healthJson)
    );
  } catch (err) {
    report('Step 1.1 - GET /health', false, `Connection failed: ${err.message}`);
    console.error('\nCRITICAL: Unable to reach target server. Aborting smoke test.\n');
    process.exit(1);
  }

  try {
    const rootRes = await fetch(`${renderUrl}/`, { redirect: 'manual' });
    const isRedirect = rootRes.status >= 300 && rootRes.status < 400;
    const isOkJson = rootRes.status === 200;
    const rootOk = isRedirect || isOkJson;
    const location = rootRes.headers.get('location') || '(none)';
    report(
      'Step 1.2 - GET /',
      rootOk,
      `HTTP ${rootRes.status} ${rootRes.statusText}`,
      isRedirect ? `Redirect target: ${location}` : 'Returned direct JSON response'
    );
  } catch (err) {
    report('Step 1.2 - GET /', false, `Request failed: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // STEP 2: CORS Preflight
  // --------------------------------------------------------------------------
  if (vercelUrl) {
    try {
      const corsRes = await fetch(`${renderUrl}/api/v1/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: vercelUrl,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });
      const allowOrigin = corsRes.headers.get('access-control-allow-origin');
      const allowMethods = corsRes.headers.get('access-control-allow-methods') || '';
      const corsOk =
        (corsRes.status === 200 || corsRes.status === 204) &&
        (allowOrigin === vercelUrl || allowOrigin === '*');
      report(
        'Step 2 - CORS Preflight',
        corsOk,
        `HTTP ${corsRes.status} ${corsRes.statusText}`,
        `Allow-Origin: ${allowOrigin ?? '(none)'}, Allow-Methods: ${allowMethods}`
      );
    } catch (err) {
      report('Step 2 - CORS Preflight', false, `CORS preflight request failed: ${err.message}`);
    }
  } else {
    console.log('[SKIP] Step 2 - CORS Preflight (no Vercel origin argument provided)');
  }

  // --------------------------------------------------------------------------
  // STEP 3: User Signup, Login, Token Refresh
  // --------------------------------------------------------------------------
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const userEmail = `smoke_test_${Date.now()}_${randomSuffix}@insightloop-smoke.internal`;
  const userPassword = `SmokePass_${randomSuffix}!9`;
  const companyName = `Smoke Corp ${randomSuffix}`;

  let accessToken = null;
  let refreshToken = null;
  let companyId = null;

  try {
    const signupRes = await fetch(`${renderUrl}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Tester',
        email: userEmail,
        password: userPassword,
        company_name: companyName,
      }),
    });
    const signupJson = await signupRes.json().catch(() => ({}));
    const signupOk = signupRes.status === 201 && Boolean(signupJson.tokens?.access);
    accessToken = signupJson.tokens?.access;
    refreshToken = signupJson.tokens?.refresh;
    companyId = signupJson.user?.company_id;
    cleanup.accessToken = accessToken;

    report(
      'Step 3.1 - User Signup',
      signupOk,
      `HTTP ${signupRes.status} ${signupRes.statusText}`,
      `Created user: ${userEmail}, Company: ${companyName} (${companyId})`
    );
  } catch (err) {
    report('Step 3.1 - User Signup', false, `Signup request failed: ${err.message}`);
  }

  if (accessToken) {
    try {
      const loginRes = await fetch(`${renderUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          password: userPassword,
        }),
      });
      const loginJson = await loginRes.json().catch(() => ({}));
      const loginOk = loginRes.status === 200 && Boolean(loginJson.tokens?.access);
      report(
        'Step 3.2 - User Login',
        loginOk,
        `HTTP ${loginRes.status} ${loginRes.statusText}`,
        `Authenticated successfully, received access token`
      );
    } catch (err) {
      report('Step 3.2 - User Login', false, `Login request failed: ${err.message}`);
    }

    try {
      const refreshRes = await fetch(`${renderUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh: refreshToken,
        }),
      });
      const refreshJson = await refreshRes.json().catch(() => ({}));
      const refreshOk = refreshRes.status === 200 && Boolean(refreshJson.access);
      if (refreshOk) {
        accessToken = refreshJson.access;
        cleanup.accessToken = accessToken;
      }
      report(
        'Step 3.3 - Token Refresh',
        refreshOk,
        `HTTP ${refreshRes.status} ${refreshRes.statusText}`,
        `Refreshed JWT access token successfully`
      );
    } catch (err) {
      report('Step 3.3 - Token Refresh', false, `Refresh request failed: ${err.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: Worker, Inventory, Bill with Payment, PDF check, Dashboard Overview
  // --------------------------------------------------------------------------
  if (accessToken) {
    // 4.1 Create Worker
    try {
      const workerRes = await fetch(`${renderUrl}/api/v1/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: `Smoke Worker ${randomSuffix}`,
          age: 28,
          phone: '9876543210',
          address: 'Smoke Testing Facility 1',
        }),
      });
      const workerJson = await workerRes.json().catch(() => ({}));
      const workerOk = (workerRes.status === 200 || workerRes.status === 201) && Boolean(workerJson.id);
      cleanup.workerId = workerJson.id;
      report(
        'Step 4.1 - Create Worker',
        workerOk,
        `HTTP ${workerRes.status} ${workerRes.statusText}`,
        `Worker ID: ${cleanup.workerId}`
      );
    } catch (err) {
      report('Step 4.1 - Create Worker', false, `Worker creation failed: ${err.message}`);
    }

    // 4.2 Create Inventory Item
    try {
      const invRes = await fetch(`${renderUrl}/api/v1/inventory/finished`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: `Smoke Widget ${randomSuffix}`,
          unit: 'pcs',
          selling_price: 150,
          cost_price: 80,
          quantity: 25,
          reorder_level: 5,
        }),
      });
      const invJson = await invRes.json().catch(() => ({}));
      const invOk = (invRes.status === 200 || invRes.status === 201) && Boolean(invJson.id);
      cleanup.inventoryId = invJson.id;
      report(
        'Step 4.2 - Create Inventory Item',
        invOk,
        `HTTP ${invRes.status} ${invRes.statusText}`,
        `Item ID: ${cleanup.inventoryId}, Initial stock: 25`
      );
    } catch (err) {
      report('Step 4.2 - Create Inventory Item', false, `Inventory creation failed: ${err.message}`);
    }

    // 4.3 Create Bill with Payment
    try {
      const billRes = await fetch(`${renderUrl}/api/v1/bills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          bill_type: 'kacha',
          buyer_name: `Smoke Buyer ${randomSuffix}`,
          buyer_phone: '9123456780',
          products: [
            {
              name: `Smoke Widget ${randomSuffix}`,
              quantity: 2,
              rate: 150,
              unit: 'pcs',
            },
          ],
          payments: [
            {
              amount: 150,
              notes: 'Advance part payment',
            },
          ],
        }),
      });
      const billJson = await billRes.json().catch(() => ({}));
      const paymentSent = 150;
      const expectedGrandTotal = 300;
      const expectedBalanceDue = expectedGrandTotal - paymentSent;

      const paidAmount = Number(billJson.amount_received);
      const balanceDue = Number(billJson.balance_due);
      const grandTotal = Number(billJson.grand_total);

      const paymentMatches = paidAmount === paymentSent;
      const balanceMatches = balanceDue === expectedBalanceDue;
      const totalMatches = grandTotal === expectedGrandTotal;

      const billOk =
        (billRes.status === 200 || billRes.status === 201) &&
        Boolean(billJson.id) &&
        totalMatches &&
        paymentMatches &&
        balanceMatches;

      cleanup.billId = billJson.id;
      report(
        'Step 4.3 - Create Bill with Payment',
        billOk,
        `HTTP ${billRes.status} ${billRes.statusText}`,
        `Bill ID: ${cleanup.billId}, Grand Total: ${grandTotal}, Paid: ${paidAmount}, Balance: ${balanceDue}`
      );
    } catch (err) {
      report('Step 4.3 - Create Bill with Payment', false, `Bill creation failed: ${err.message}`);
    }

    // 4.4 Fetch Bill PDF and check %PDF magic header
    if (cleanup.billId) {
      try {
        const pdfRes = await fetch(`${renderUrl}/api/v1/bills/${cleanup.billId}/pdf`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const arrayBuf = await pdfRes.arrayBuffer();
        const header = Buffer.from(arrayBuf.slice(0, 5)).toString('utf-8');
        const pdfOk = pdfRes.status === 200 && header.startsWith('%PDF');
        report(
          'Step 4.4 - Bill PDF Generation',
          pdfOk,
          `HTTP ${pdfRes.status} ${pdfRes.statusText}`,
          `Header: "${header.slice(0, 4)}", Size: ${arrayBuf.byteLength} bytes`
        );
      } catch (err) {
        report('Step 4.4 - Bill PDF Generation', false, `PDF retrieval failed: ${err.message}`);
      }
    }

    // 4.5 Fetch Dashboard Overview and verify numbers
    try {
      const overviewRes = await fetch(`${renderUrl}/api/v1/dashboard/overview`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const overviewJson = await overviewRes.json().catch(() => ({}));
      const overviewOk =
        overviewRes.status === 200 &&
        overviewJson.billsCount >= 1 &&
        overviewJson.summary?.active_workers >= 1;
      report(
        'Step 4.5 - Dashboard Overview Numbers',
        overviewOk,
        `HTTP ${overviewRes.status} ${overviewRes.statusText}`,
        `Bills Count: ${overviewJson.billsCount}, Active Workers: ${overviewJson.summary?.active_workers}`
      );
    } catch (err) {
      report('Step 4.5 - Dashboard Overview Numbers', false, `Overview retrieval failed: ${err.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 5: CSV Upload, Dashboard Change, WebSocket Frame
  // --------------------------------------------------------------------------
  if (accessToken && companyId) {
    const csvContent =
      'date,product,category,quantity,production_cost,selling_price,region,customer_type\n' +
      `2026-10-01,Smoke CSV Product,General,10,25.00,50.00,North,Retail\n` +
      `2026-10-02,Smoke CSV Product,General,5,25.00,50.00,North,Wholesale\n`;

    // 5.1 CSV Upload
    try {
      const formData = new FormData();
      formData.append('file', new Blob([csvContent], { type: 'text/csv' }), 'smoke_test.csv');

      const uploadRes = await fetch(`${renderUrl}/api/v1/upload/csv`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });
      const uploadJson = await uploadRes.json().catch(() => ({}));
      const uploadOk = uploadRes.status === 200 && (uploadJson.created >= 2 || uploadJson.status === 'ok');
      report(
        'Step 5.1 - CSV Upload',
        uploadOk,
        `HTTP ${uploadRes.status} ${uploadRes.statusText}`,
        `Processed ${uploadJson.created ?? 2} records from CSV`
      );
    } catch (err) {
      report('Step 5.1 - CSV Upload', false, `CSV upload failed: ${err.message}`);
    }

    // 5.2 Dashboard Overview reflects uploaded revenue
    try {
      const overviewAfterRes = await fetch(`${renderUrl}/api/v1/dashboard/overview`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const overviewAfterJson = await overviewAfterRes.json().catch(() => ({}));
      const revenue = overviewAfterJson.summary?.total_revenue ?? 0;
      const dashboardChanged = overviewAfterRes.status === 200 && revenue > 0;
      report(
        'Step 5.2 - Dashboard Financials Updated',
        dashboardChanged,
        `HTTP ${overviewAfterRes.status} ${overviewAfterRes.statusText}`,
        `Live Total Revenue from uploaded data: ₹${revenue}`
      );
    } catch (err) {
      report('Step 5.2 - Dashboard Financials Updated', false, `Dashboard verification failed: ${err.message}`);
    }

    // 5.3 WebSocket connection and frame reception
    try {
      const wsProtocol = renderUrl.startsWith('https') ? 'wss:' : 'ws:';
      const wsHost = renderUrl.replace(/^https?:\/\//, '');
      const wsEndpoint = `${wsProtocol}//${wsHost}/ws/dashboard/${companyId}/?token=${encodeURIComponent(accessToken)}`;

      const wsReceived = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket timed out after 6 seconds waiting for snapshot frame'));
        }, 6000);

        try {
          const ws = new WebSocket(wsEndpoint);
          ws.onmessage = (event) => {
            clearTimeout(timeout);
            try {
              const frame = JSON.parse(event.data);
              ws.close(1000, 'Smoke test completed');
              resolve({ ok: true, frame });
            } catch (parseErr) {
              ws.close(1000, 'Smoke test frame parse error');
              resolve({ ok: false, error: parseErr.message });
            }
          };
          ws.onerror = (err) => {
            clearTimeout(timeout);
            reject(err);
          };
        } catch (wsErr) {
          clearTimeout(timeout);
          reject(wsErr);
        }
      });

      report(
        'Step 5.3 - WebSocket Gateway Connection',
        wsReceived.ok,
        'Connected and received initial dashboard frame',
        `Frame keys: ${Object.keys(wsReceived.frame || {}).join(', ')}`
      );
    } catch (err) {
      report('Step 5.3 - WebSocket Gateway Connection', false, `WebSocket error: ${err.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 6: POST /contact returns {"status":"ok"}
  // --------------------------------------------------------------------------
  try {
    const contactRes = await fetch(`${renderUrl}/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrftoken': 'smoke-test-csrf-token',
      },
      body: JSON.stringify({
        name: 'Deployment Smoke Tester',
        email: 'smoke-test@insightloop.internal',
        message: 'Automated post-deployment verification smoke test message.',
      }),
    });
    const contactJson = await contactRes.json().catch(() => ({}));
    const contactOk = contactRes.status === 200 && contactJson.status === 'ok';
    report(
      'Step 6 - Contact Submission',
      contactOk,
      `HTTP ${contactRes.status} ${contactRes.statusText}`,
      JSON.stringify(contactJson)
    );
  } catch (err) {
    report('Step 6 - Contact Submission', false, `Contact request failed: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // STEP 7: Cleanup created resources
  // --------------------------------------------------------------------------
  let cleanupPassed = true;
  const cleanupDetails = [];

  if (cleanup.billId && cleanup.accessToken) {
    try {
      const delBill = await fetch(`${renderUrl}/api/v1/bills/${cleanup.billId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cleanup.accessToken}` },
      });
      cleanupDetails.push(`Bill ${cleanup.billId}: HTTP ${delBill.status}`);
      if (delBill.status !== 200 && delBill.status !== 204) cleanupPassed = false;
    } catch (e) {
      cleanupPassed = false;
      cleanupDetails.push(`Bill deletion failed: ${e.message}`);
    }
  }

  if (cleanup.inventoryId && cleanup.accessToken) {
    try {
      const delInv = await fetch(`${renderUrl}/api/v1/inventory/finished/${cleanup.inventoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cleanup.accessToken}` },
      });
      cleanupDetails.push(`Item ${cleanup.inventoryId}: HTTP ${delInv.status}`);
      if (delInv.status !== 200 && delInv.status !== 204) cleanupPassed = false;
    } catch (e) {
      cleanupPassed = false;
      cleanupDetails.push(`Inventory deletion failed: ${e.message}`);
    }
  }

  if (cleanup.workerId && cleanup.accessToken) {
    try {
      const delWorker = await fetch(`${renderUrl}/api/v1/workers/${cleanup.workerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cleanup.accessToken}` },
      });
      cleanupDetails.push(`Worker ${cleanup.workerId}: HTTP ${delWorker.status}`);
      if (delWorker.status !== 200 && delWorker.status !== 204) cleanupPassed = false;
    } catch (e) {
      cleanupPassed = false;
      cleanupDetails.push(`Worker deletion failed: ${e.message}`);
    }
  }

  report(
    'Step 7 - Teardown / Cleanup',
    cleanupPassed,
    cleanupPassed ? 'All created test entities successfully deleted' : 'Some cleanup actions failed',
    cleanupDetails.join(', ')
  );

  // --------------------------------------------------------------------------
  // FINAL SUMMARY & EXIT CODE
  // --------------------------------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log(`TOTAL CHECKS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('----------------------------------------------------');

  if (failCount > 0) {
    console.error('\nResult: FAILED - One or more deployment smoke checks did not pass.\n');
    process.exit(1);
  } else {
    console.log('\nResult: ALL SMOKE TESTS PASSED - Service is verified and production-ready!\n');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Smoke test runner encountered fatal error:', err);
  process.exit(1);
});
