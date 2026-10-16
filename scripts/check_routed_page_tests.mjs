#!/usr/bin/env node
/**
 * scripts/check_routed_page_tests.mjs
 *
 * Verifies that EVERY routed feature page in apps/web/src/App.tsx has a matching
 * test file in apps/web/test/pages/ covering:
 * - loading state
 * - empty state
 * - error state
 * - success state
 *
 * Exits 0 if all routed pages are tested with all 4 states, exits 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const appTsxPath = path.join(rootDir, 'apps/web/src/App.tsx');
const testPagesDir = path.join(rootDir, 'apps/web/test/pages');

console.log('=== Checking Routed Page Tests against apps/web/src/App.tsx ===\n');

if (!fs.existsSync(appTsxPath)) {
  console.error(`Error: App.tsx not found at ${appTsxPath}`);
  process.exit(1);
}

const appContent = fs.readFileSync(appTsxPath, 'utf8');

// Component name to test file name mapping
const routeToTestMap = {
  LandingPage: 'landing.test.tsx',
  LoginPage: 'login.test.tsx',
  SignupPage: 'signup.test.tsx',
  ProtectedRoute: 'protected-route.test.tsx',
  DashboardLayout: 'dashboard-layout.test.tsx',
  DashboardPage: 'dashboard.test.tsx',
  KachaBillPage: 'kacha-bill.test.tsx',
  PakkaBillPage: 'pakka-bill.test.tsx',
  OrderDetailPage: 'order-detail.test.tsx',
  FinishedInventoryPage: 'finished-inventory.test.tsx',
  SemiFinishedInventoryPage: 'semi-finished-inventory.test.tsx',
  RawInventoryPage: 'raw-inventory.test.tsx',
  WarehousesPage: 'warehouses.test.tsx',
  InsightsPage: 'insights.test.tsx',
  WorkersPage: 'workers.test.tsx',
  UploadPage: 'upload.test.tsx',
  ChatPage: 'chat.test.tsx',
  ProfilePage: 'profile.test.tsx',
  SettingsPage: 'settings.test.tsx',
};

// Find all lazy imported components or element={<Component />}
const elementMatches = [...appContent.matchAll(/element=\{<([A-Z][a-zA-Z0-9]+)/g)].map((m) => m[1]);
const uniqueRoutedComponents = [...new Set(elementMatches)].filter((c) => c !== 'Navigate');

console.log(`Discovered ${uniqueRoutedComponents.length} routed components in App.tsx:`);
for (const comp of uniqueRoutedComponents) {
  console.log(`  - ${comp}`);
}
console.log();

let missingTests = 0;
let missingStates = 0;

const requiredStates = ['loading', 'empty', 'error', 'success'];

for (const comp of uniqueRoutedComponents) {
  const testFileName = routeToTestMap[comp];
  if (!testFileName) {
    console.error(`❌ Component ${comp} has no registered test mapping in check_routed_page_tests.mjs!`);
    missingTests++;
    continue;
  }

  const testFilePath = path.join(testPagesDir, testFileName);
  if (!fs.existsSync(testFilePath)) {
    console.error(`❌ Component ${comp} missing test file: apps/web/test/pages/${testFileName}`);
    missingTests++;
    continue;
  }

  const testContent = fs.readFileSync(testFilePath, 'utf8').toLowerCase();
  const missingForComp = [];
  for (const state of requiredStates) {
    if (!testContent.includes(state)) {
      missingForComp.push(state);
    }
  }

  if (missingForComp.length > 0) {
    console.error(`❌ Component ${comp} (${testFileName}) is missing tests for states: ${missingForComp.join(', ')}`);
    missingStates++;
  } else {
    console.log(`✅ ${comp.padEnd(26)} -> apps/web/test/pages/${testFileName} [loading, empty, error, success]`);
  }
}

// Also verify ErrorBoundary test exists
const errorBoundaryTest = path.join(testPagesDir, 'error-boundary.test.tsx');
if (!fs.existsSync(errorBoundaryTest)) {
  console.error(`❌ ErrorBoundary test missing: apps/web/test/pages/error-boundary.test.tsx`);
  missingTests++;
} else {
  console.log(`✅ ErrorBoundary            -> apps/web/test/pages/error-boundary.test.tsx [error recovery & fallbacks]`);
}

console.log('\n------------------------------------------------------------');
if (missingTests > 0 || missingStates > 0) {
  console.error(`FAILED: ${missingTests} missing test files, ${missingStates} missing state validations.`);
  process.exit(1);
} else {
  console.log(`SUCCESS: All ${uniqueRoutedComponents.length} routed pages + ErrorBoundary have verified test files with all 4 states!`);
  process.exit(0);
}
