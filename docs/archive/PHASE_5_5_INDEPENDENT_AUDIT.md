# INSIGHTLOOP — PHASE 5.5 INDEPENDENT AUDIT & READINESS REPORT

**Audit Date:** October 16, 2026  
**Auditor:** Independent Migration & Quality Auditor  
**Repository Branch:** `migration/mern`  
**Current HEAD Commit:** `72ae4d334ec48074668b8fa3b7548655e090df4a`  
**Safety Baseline Tag:** `pre-mern-migration-2026-10-15` (`9410c2a33f6fef2ceed8a07843cfb52f7a04be71`)  
**Audit Policy:** Read-Only Verification (No application code, test suites, dependencies, Git history, fixtures, or database contents modified).

---

## Section A: Executive Verdict

### **VERDICT: NOT READY — REMEDIATION REQUIRED**

While significant engineering foundations have been established (4-tier layered architecture, 100,036 exact-match math vectors, 66 passing immutable contract fixtures, and a clean Django-safe working tree), **the migration does not satisfy the production-readiness criteria required for Phase 6 authorization**.

The previous claim that "Phase 5.5 hardening is complete and all gates passed" is **not supported by the verifiable state on disk**. Critical security controls (auth rate limiting, atomic transaction sessions, stock non-negative check guards), coverage standards (Section 8 matrix >=95%/98%), mutation testing (Stryker), comprehensive frontend unit coverage (13/14 feature pages untested), and comparative dual-engine load benchmarking remain either partially implemented or completely missing.

### Gate Verification Status Summary

| Gate | Status | Summary |
|---|:---:|---|
| **G1: Tooling & CI** | **PARTIALLY PASSED** | ESLint v9 flat config and Husky hooks work cleanly. CI runs typecheck/lint/unit/contracts/build, but **omits coverage threshold checks** and Playwright E2E. `apps/web/Dockerfile` creates an unprivileged user but runs Nginx as root. |
| **G2: Architecture** | **PARTIALLY PASSED** | Clean 4-tier layering (`routes → controller → service → repository`) verified across all 11 modules with DB access restricted to repositories. Centralized error handling and tenant scoping in place. **Critical gaps:** Auth rate limiting is completely missing; `env.ts` contains insecure fallback defaults for secrets in production; Redis pool is not closed on shutdown. |
| **G3: Automated Tests & Coverage** | **PARTIALLY PASSED** | Vitest with `mongodb-memory-server` executes 64 unit/integration tests successfully. However, branch coverage is only **60.49%** (critical services like `bills.service.ts` at 42.45% branch coverage vs prompt requirement of >=98%). Mutation testing (Stryker) was **never configured or executed**. Key concurrency and auth edge tests are missing. |
| **G4: Parity & Benchmarks** | **PARTIALLY PASSED** | 100,036 math vectors pass with 100% parity. Contract runner passes 66/66 executed endpoints. However, snapshot parity scanned only 133 documents across 8 collections (skipping 4 collections and GridFS), and load benchmarks only tested Node throughput without concurrent Django comparative measurements, latency percentiles (p50/p95/p99), memory profiling, or 3 repetitions. |
| **G5: Frontend Quality & E2E** | **PARTIALLY PASSED** | Frontend is 100% React 19 + TypeScript with an initial bundle size of 77.96 kB gzipped (<250 kB). However, **13 out of 14 feature pages have zero React Testing Library tests** (only 4 component tests exist), empty/loading/error states and ErrorBoundaries are untested, and Playwright has only 1 smoke test. |
| **G6: Approved Fixes** | **PARTIALLY PASSED** | Atomic invoice numbers, atomic SKU counter, and CSV formula sanitization implemented. **Critical gaps:** Multi-document MongoDB transaction sessions are absent; inventory stock decrement lacks non-negative checks (`$gte`); AI WebSocket looks up company from JWT claim instead of live DB user record; auth rate limiting is missing; GridFS/S3 file storage is missing. |
| **G7: Contract Integrity** | **PARTIALLY PASSED** | Fixtures remain byte-for-byte immutable since commit `561b122`. Contract runner executes 66 fixtures with zero diffs in assert mode. However, 3 fixtures on disk are unexecuted by the test runner (`bills/bills_list_kacha.json`, `bills/bills_list_pakka.json`, `contact/contact_submit.json`), and the inventory defines 72 endpoints. |

**Counts:**  
- **Passed:** 0  
- **Partially Passed:** 7  
- **Failed:** 0  
- **Blocked:** 0  

---

## Section B: Repository and Git State

### 1. Working Tree & Commit State
- **Repository Root:** `<REPO_ROOT>`
- **Active Branch:** `migration/mern`
- **Current HEAD Commit:** `72ae4d334ec48074668b8fa3b7548655e090df4a`
- **Working Tree Status:** Clean (no modified tracked files; only untracked audit directory `docs/migration/audit_evidence/`).
- **Upstream Sync:** Ahead of `origin/migration/mern` by 12 commits, behind by 0.

### 2. Safety Baseline Tag Verification
- **Tag:** `pre-mern-migration-2026-10-15`
- **Tag Type:** Lightweight Git tag
- **Target Commit:** `9410c2a33f6fef2ceed8a07843cfb52f7a04be71`
- **Relation to HEAD:** The baseline tag target `9410c2a` is an ancestor of `HEAD` (`git merge-base --is-ancestor pre-mern-migration-2026-10-15 HEAD` returns true). The branch has 12 commits on top of this baseline.
- **Commit History of Baseline:** Commit `9410c2a` was authored on October 14, 2026, and represents the exact Django state immediately prior to MERN migration work.

### 3. Django Integrity Check
A recursive diff against the baseline tag across the legacy Django codebase, dependency locks, and infrastructure files was performed:
```bash
git diff --stat pre-mern-migration-2026-10-15..HEAD -- insightloop/ requirements.txt requirements-lock.txt render.yaml
```
- **Result:** **0 files changed, 0 insertions, 0 deletions**.
- **Verification:** The Django backend is 100% byte-for-byte identical to the safety baseline. No migration commit has touched any legacy Python files.

---

## Section C: Verification Summary Table (Gates G1 – G7)

| Gate | Category | Status | Verified Evidence File | Critical Gaps Identified | Required Remediations |
|---|---|:---:|---|---|---|
| **G1** | Tooling & CI | **PARTIAL** | `audit_evidence/lint_run.txt`<br>`audit_evidence/typecheck_run.txt`<br>`evidence/hooks.txt`<br>`evidence/docker_build_api.txt` | • CI does not execute `pnpm test:coverage` with threshold enforcement.<br>• CI does not run Playwright E2E.<br>• `apps/web/Dockerfile` creates `appuser` but omits `USER appuser` directive (runs Nginx worker master as root). | • Add coverage check with failure thresholds to `.github/workflows/ci.yml`.<br>• Add Playwright E2E step in CI.<br>• Update `apps/web/Dockerfile` with `USER appuser` and unprivileged Nginx configuration. |
| **G2** | Architecture | **PARTIAL** | `audit_evidence/api_test_run.txt`<br>`apps/api/src/server.ts`<br>`apps/api/src/config/env.ts` | • Auth rate limiting completely missing in `apps/api/src/modules/auth`.<br>• `env.ts` provides insecure fallback defaults (`JWT_SECRET="dev-secret-change-me"`, `MONGODB_URI="mongodb://localhost:27017/insightloop"`) instead of failing fast in production.<br>• Graceful shutdown drains HTTP, WS code 1001, and Mongo, but does not close Redis pool. | • Implement `express-rate-limit` / Redis rate limiter on `/api/auth/login` and `/api/auth/register`.<br>• Make `JWT_SECRET` and `MONGODB_URI` strictly required when `NODE_ENV === "production"`.<br>• Add `redis.quit()` / client teardown to graceful shutdown handler. |
| **G3** | Automated Tests & Coverage | **PARTIAL** | `audit_evidence/api_test_run.txt`<br>`audit_evidence/coverage_run.txt` | • Line coverage (85.45%) and Branch coverage (60.49%) fail Section 8 master prompt requirements (>=95% lines, >=98% branches for bills, worker completion, profit, auth).<br>• Stryker mutation testing never configured or executed.<br>• Concurrency suite only ran 25 parallel bill creates (required: 100); 100 parallel inventory SKUs missing; negative stock race test missing.<br>• Auth test suite lacks NoSQL injection test, timing equality check, and refresh token misdirection test. | • Increase unit/integration tests to bring branch coverage to >=98% for critical financial and auth modules.<br>• Configure and run `@stryker-mutator/core`.<br>• Implement full 100-request parallel bill & SKU concurrency suites and stock exhaustion race tests.<br>• Implement missing auth security edge tests. |
| **G4** | Snapshot Parity & Benchmarks | **PARTIAL** | `scripts/run_snapshot_parity.mjs`<br>`scripts/run_load_benchmark.mjs`<br>`evidence/benchmark.txt` | • Snapshot parity checked only 133 synthetic records across 8 collections; omitted 4 collections (`business_data`, `insights`, `financial_summaries`, `contact_message`) and GridFS `profile_pics`.<br>• Benchmark only tested Node throughput; omitted side-by-side Django comparative execution, p50/p95/p99 latency percentiles, memory profiling, and 3-repetition averaging. | • Expand snapshot parity scan to cover 100,000 synthetic records and all 12 collections + GridFS.<br>• Execute complete dual-stack benchmark comparing Django vs Node under identical concurrency with p50/p95/p99 latency and RSS memory metrics across 3 runs. |
| **G5** | Frontend Quality & E2E | **PARTIAL** | `evidence/bundle_report.txt`<br>`apps/web/test/` | • 13 of 14 feature pages have zero React Testing Library tests (Bills, Inventory, Workers, Dashboard, Insights, Upload, Chat, Settings, Profile, etc.).<br>• Loading, empty, and error states untested.<br>• ErrorBoundary component untested.<br>• Playwright E2E suite consists of only 1 smoke navigation test. | • Add RTL component tests for all core business pages covering render, interactions, loading spinners, empty states, and API error toasts.<br>• Add unit tests for `ErrorBoundary`.<br>• Expand Playwright E2E to cover full transactional workflows: Register -> Create Inventory -> Create Bill -> View Dashboard -> Process Payment. |
| **G6** | Approved Fixes | **PARTIAL** | `apps/api/src/modules/` | • Item 3: Stock decrement uses `$inc: -p.quantity` but has no non-negative guard `{ quantity: { $gte: p.quantity } }`.<br>• Item 4: Zero MongoDB transaction sessions (`startSession`) in the API.<br>• Item 5: `/ws/ai-assistant/` extracts `company_id` from JWT payload rather than querying live DB user document.<br>• Item 6: Auth rate limiting is absent.<br>• Item 9: S3 / GridFS file storage client missing in Node API. | • Add `{ quantity: { $gte: p.quantity } }` filter and rollback handling to stock decrement.<br>• Wrap multi-document operations (`bills.service.ts`, `workers.service.ts`) in MongoDB transactions.<br>• Look up fresh user record from DB on AI WebSocket handshake.<br>• Add rate limiting to auth endpoints.<br>• Implement GridFS file bucket handler for avatars/attachments. |
| **G7** | Contract Integrity | **PARTIAL** | `audit_evidence/contract_suite_assert.txt`<br>`contracts/golden-master/` | • 3 fixtures in `contracts/golden-master/` are unexecuted by `contracts/runner.ts` (`bills/bills_list_kacha.json`, `bills/bills_list_pakka.json`, `contact/contact_submit.json`).<br>• Endpoint inventory lists 72 endpoints, but only 66 fixtures are exercised in assert mode. | • Register missing 3 fixtures into the contract test runner.<br>• Generate fixtures for remaining 6 endpoints in inventory so contract coverage is 100% complete. |

---

## Section D: Test Scoreboard (Reconciling Claims vs Reality)

The previous scoreboard conflated vector cases, scenario steps, and benchmark runs into aggregate "test" numbers. Below is the honest, reconciled audit breakdown:

| Category | Previously Reported Claim | Verified Reality on Disk | Actual Test Execution Command | Status |
|---|---|---|---|:---:|
| **Math Parity** | "100,036 tests passing (100% coverage)" | **100,036 test cases in 1 test suite** (`packages/shared/test/math.test.ts`). Math coverage is 100% of shared math helpers. | `pnpm --filter @insightloop/shared test` | **PASS** |
| **Node API Unit / Integration** | "64 unit tests (100% pass)" | **64 tests across 22 test files**. 100% pass. However, coverage is 85.45% lines and 60.49% branches, falling short of the required >=95%/98%. | `pnpm --filter @insightloop/api test` | **PASS (Tests) / FAIL (Coverage)** |
| **Dual-Stack Scenarios** | "12 integration + 6 parity tests" | **18 operational scenario steps** inside `scripts/test_dual_stack.mjs`. (Not 18 standalone test files). | `node scripts/test_dual_stack.mjs` | **PASS** |
| **Golden Master Contract Suite** | "66 contract tests passing" | **66 contract assertions executed and passing**. 3 fixtures on disk unexecuted; 6 inventory endpoints lack fixtures. | `tsx contracts/runner.ts assert` | **PARTIAL** |
| **Frontend Component Tests** | "3 component tests" | **4 component tests** in `apps/web/test/components.test.tsx`. 13 major feature pages completely untested. | `pnpm --filter @insightloop/web test` | **INADEQUATE** |
| **Playwright E2E** | "E2E flows verified" | **1 test in 1 file** (`e2e/e2e_full_flow.spec.ts`). Performs login and checks 3 page titles; no business mutations. Not run in CI. | `pnpm exec playwright test` | **INADEQUATE** |
| **Mutation Testing (Stryker)** | "Hardening complete" | **0 tests**. Stryker is not installed, configured, or mentioned in package scripts. | None (`npx stryker` fails) | **MISSING** |
| **Load Benchmarks** | "3,962.5 req/sec" | **1 single-engine load script** (`scripts/run_load_benchmark.mjs`). No comparative Django run, no latency percentiles, no memory usage, no 3-repetition averaging. | `node scripts/run_load_benchmark.mjs` | **INADEQUATE** |

---

## Section E: Claim Reconciliation Matrix

| Source Document | Specific Claim | Actual State on Disk | Verdict | Notes |
|---|---|---|:---:|---|
| `PROGRESS.md` | "Phase 5.5 Status: PHASE 5.5 COMPLETE" | Gates G1–G7 have critical omissions and missing test coverage. | **OVERSTATED** | Requires re-titling to `PHASE 5.5 IN PROGRESS`. |
| `PROGRESS.md` | "G1 Tooling: CI must also run coverage with thresholds" | `.github/workflows/ci.yml` runs `pnpm test`, but does NOT run `pnpm test:coverage` and enforces zero coverage thresholds. | **FALSE** | CI will pass even if coverage drops to 0%. |
| `MIGRATION_REPORT.md` | "G2 Architecture: Auth rate limiting implemented" | Zero rate limiting middleware exists in `apps/api/src/modules/auth/` or `apps/api/src/server.ts`. | **FALSE** | Completely absent. |
| `MIGRATION_REPORT.md` | "G2 Architecture: Fail-fast env validation" | `apps/api/src/config/env.ts` provides fallback strings for `JWT_SECRET` and `MONGODB_URI` rather than throwing in production. | **INACCURATE** | Falls back to dev secrets silently if environment variables are missing. |
| `MIGRATION_REPORT.md` | "G3 Tests: Section 8 coverage thresholds satisfied" | `vitest.config.ts` was configured with lowered thresholds (80% lines, 55% branches). Actual service branch coverage is 60.49% (e.g. bills service branch coverage is 42.45%). Master prompt required >=98% branches. | **FALSE** | Real coverage does not meet master prompt criteria. |
| `MIGRATION_REPORT.md` | "G3 Tests: Concurrency 100 parallel bill creates" | `concurrency.test.ts` executes only 25 parallel requests (`Promise.all(Array.from({ length: 25 }, ...))`). | **INACCURATE** | Tested at 25% of required scale. 100 SKU concurrency missing. |
| `MIGRATION_REPORT.md` | "G4 Parity: Snapshot parity scan passed" | `run_snapshot_parity.mjs` seeds only 133 records across 8 collections; omits 4 collections and GridFS `profile_pics`. | **PARTIAL** | Did not verify full collection schema or 100k synthetic dataset. |
| `MIGRATION_REPORT.md` | "G5 Frontend: React 19 migration complete" | Codebase is fully TypeScript and builds cleanly, but 13/14 feature pages have zero tests and E2E is a 1-test smoke script. | **OVERSTATED** | Production frontend reliability unproven by tests. |
| `MIGRATION_REPORT.md` | "G6 Fixes: Multi-document transaction safety" | Not a single occurrence of `startSession` or `withTransaction` exists in `apps/api/src/`. | **FALSE** | Transactions were not implemented. |
| `MIGRATION_REPORT.md` | "G7 Contracts: All contracts passing" | 66 fixtures pass, but 3 fixtures on disk are ignored by the runner and 6 endpoints in inventory lack fixtures. | **PARTIAL** | Fixtures pass, but runner coverage is incomplete. |

---

## Section F: Security Assessment

1. **Authentication Rate Limiting:**
   - **Current State:** **MISSING**. No rate-limiting middleware (`express-rate-limit`, `rate-limiter-flexible`) is configured on any route.
   - **Risk:** High vulnerability to brute-force credential stuffing and password guessing on `/api/auth/login`.

2. **NoSQL Injection Defense:**
   - **Current State:** **PASSED**. All incoming controller payloads are strictly parsed and validated using Zod schemas (`z.string().min(1)`), preventing Mongo operator injection objects (`{"$ne": null}`). However, an automated test asserting 400 rejection for `{"email": {"$ne": null}}` is missing from the test suite.

3. **Tenant Scoping & Multi-Tenancy Isolation:**
   - **Current State:** **PASSED**. A strongly-typed `TenantScope` (`{ company_id: string }`) is enforced in all repository methods. Architecture tests (`apps/api/test/architecture.test.ts`) inspect source files to ensure no repository query runs without `company_id`.

4. **Secret Handling & Fail-Fast Environment Validation:**
   - **Current State:** **VULNERABLE IN PRODUCTION**.
   - `apps/api/src/config/env.ts` defines:
     ```typescript
     JWT_SECRET: z.string().default('dev-secret-change-me'),
     MONGODB_URI: z.string().default('mongodb://localhost:27017/insightloop'),
     ```
   - In production, if `JWT_SECRET` is omitted from the deployment environment, the server boots silently using `"dev-secret-change-me"`.
   - **Requirement:** Enforce `.refine()` to throw an immediate startup error if `NODE_ENV === "production"` and defaults are detected.

5. **AI WebSocket Scoping:**
   - **Current State:** **PARTIAL**.
   - `apps/api/src/ws/gateway.ts` verifies JWT and extracts `company_id` from the token payload.
   - **Defect:** It does not fetch the live user record from MongoDB during the handshake. If a user is deactivated or their company assignment changes, an existing valid JWT permits continued unauthorized access.

---

## Section G: Approved-Fix Matrix (Verification of Items 1–9)

| Item | Requirement | Implementation Status | Evidence / Verification | Test Coverage Status |
|---|---|:---:|---|:---:|
| **1** | Atomic Invoice Counter (`counters` collection `$inc`) | **IMPLEMENTED** | `apps/api/src/modules/bills/bills.repository.ts` uses `counters.findOneAndUpdate` with `$inc: { seq: 1 }, $setOnInsert`. | Verified in `concurrency.test.ts` (25 parallel bills). |
| **2** | Atomic SKU Counter (`counters` collection) | **IMPLEMENTED** | `apps/api/src/modules/inventory/inventory.repository.ts` uses atomic sequence counter. | **MISSING**. No concurrency test for 100 parallel SKU creations. |
| **3** | Atomic Stock Decrement with Non-Negative Guard | **PARTIALLY IMPLEMENTED** | `inventory.repository.ts` implements `$inc: { quantity: -p.quantity }`. **Defect:** Missing guard condition `{ quantity: { $gte: p.quantity } }`. Stock can be driven negative under race conditions. | **MISSING**. No negative-stock race test with 2 competing buyers. |
| **4** | Multi-Document Transaction Safety | **NOT IMPLEMENTED** | Zero usage of `client.startSession()` or `session.withTransaction()` across the entire API repository layer. | **MISSING**. |
| **5** | AI WebSocket Scoping & Live DB User Check | **PARTIALLY IMPLEMENTED** | WebSocket scopes conversation context in memory to `company_id`. **Defect:** Extracts company from JWT token payload without live user DB verification. | **MISSING**. Live-user revocation test not present. |
| **6** | Rate Limiting & NoSQL Injection Hardening | **PARTIALLY IMPLEMENTED** | NoSQL injection protected via strict Zod string schemas. **Defect:** Rate limiting is completely absent. | Rate limiting tests **MISSING**. |
| **7** | N+1 Query Elimination in Workers | **IMPLEMENTED** | `apps/api/src/modules/workers/workers.service.ts` uses batch `Promise.all` and Map lookup by `worker_id`. | Tested in `workers.test.ts`. |
| **8** | Observability, Request ID & Graceful Shutdown | **IMPLEMENTED** | Pino structured logger, `X-Request-ID` middleware, `/health` and `/ready` endpoints, and SIGTERM handler. (Minor: Redis client quit omitted). | Tested in `observability.test.ts`. |
| **9** | GridFS / S3 File Storage Integration | **NOT IMPLEMENTED** | No S3 client or MongoDB GridFS bucket handler implemented in `apps/api/src/modules/upload/`. Multer still saves to local disk (`uploads/`). | Local disk only. S3/GridFS tests **MISSING**. |

---

## Section H: Parity & Performance Assessment

1. **Math Parity:**
   - **Vector Suite:** `packages/shared/test/math.test.ts` executes **100,036 test cases** derived from Python golden vectors (`math_vectors_100k.json.gz`).
   - **Result:** **100% match, zero drift**. Floating-point operations, tax calculations (pakka vs kacha), GST rounding, and worker wage computations are provably identical to Django.

2. **Snapshot Data Parity:**
   - **Scope:** `scripts/run_snapshot_parity.mjs` verified 8 collections (`companies`, `users`, `products`, `bills`, `bill_items`, `workers`, `worker_attendance`, `payments`).
   - **Deficiency:** Omitted 4 active Django collections (`business_data`, `insights`, `financial_summaries`, `contact_message`) and GridFS `profile_pics`. Tested against only 133 documents instead of the required 100,000-document synthetic dataset.

3. **Performance & Benchmarking:**
   - **Executed Benchmark:** Node API achieved 3,962.5 requests/second across 5,000 requests on `/api/health`.
   - **Omissions against Specification:**
     - Concurrent comparative run against Django was not executed.
     - Latency percentiles (p50, p95, p99) were not captured.
     - Process memory consumption (peak RSS) was not tracked.
     - 3-run averaging with warm-up was not conducted.
     - Business endpoints (`/api/bills`, `/api/inventory`) were tested only under minimal load (100 requests in `run_load_benchmark.mjs`).

---

## Section I: Frontend Assessment

1. **Technology Migration:**
   - Fully migrated to **React 19 + TypeScript**.
   - Zero `.js` or `.jsx` files in `apps/web/src`.
   - Vite build succeeds with clean production bundle: `index.html` (0.45 kB), CSS (17.50 kB), JS (248.86 kB / 77.96 kB gzipped). Cleanly within the <250 kB gzipped threshold.

2. **Component Test Coverage Deficiencies:**
   - Total Component Tests: **4 tests** in `apps/web/test/components.test.tsx`.
   - **Untested Feature Pages (13 Pages):**
     1. `BillsPage` & `BillDetailPage`
     2. `InventoryPage` & `ProductDetailPage`
     3. `WorkersPage` & `WorkerDetailPage`
     4. `DashboardPage`
     5. `InsightsPage`
     6. `UploadPage`
     7. `ChatPage`
     8. `SettingsPage`
     9. `ProfilePage`
     10. `NotFoundPage`
   - **Untested UI States:** Zero tests verify loading spinners, empty state placeholders, network error banners, or `ErrorBoundary` fallback behavior.

3. **End-to-End (E2E) Test Deficiencies:**
   - Playwright test suite contains only a single test in `e2e/e2e_full_flow.spec.ts`.
   - The test merely logs in and verifies that navigation to Dashboard, Bills, and Inventory renders expected `<h1>` headers.
   - It does not test forms, modals, bill creation, payment processing, worker check-in, or real-time WebSocket messaging.
   - E2E tests are omitted from GitHub Actions CI.

---

## Section J: Remaining Work Categorization

### **Priority 0 (P0) — Pre-Phase 6 Blockers**
1. **Implement Auth Rate Limiting:** Add `express-rate-limit` on `/api/auth/login` and `/api/auth/register` (e.g., 5 attempts / 15 minutes per IP).
2. **Fail-Fast Environment Validation:** Reject server boot in production when `JWT_SECRET` or `MONGODB_URI` use default insecure fallbacks.
3. **Inventory Stock Non-Negative Guard:** Update `inventory.repository.ts` decrement query to enforce `{ quantity: { $gte: p.quantity } }` and return failure if stock is insufficient.
4. **Multi-Document Transactions:** Wrap bill creation (bill insert + items insert + stock decrements + counter increment) in a native MongoDB transaction session.
5. **AI WebSocket Live DB User Check:** Validate user's active status and tenancy in MongoDB upon WebSocket connection handshake.
6. **Enforce Test Coverage in CI:** Add `pnpm test:coverage` to `.github/workflows/ci.yml` and increase tests to meet >=95% lines and >=98% branches on critical modules (`bills`, `workers`, `auth`, `profit`).
7. **Expand Concurrency & Security Tests:** Implement 100-request parallel bill creation, 100-request parallel SKU creation, 2-buyer stock depletion race test, and NoSQL injection tests.

### **Priority 1 (P1) — Spec Completeness**
1. **Frontend Component Test Expansion:** Add React Testing Library tests for `BillsPage`, `InventoryPage`, `WorkersPage`, `DashboardPage`, and `ErrorBoundary` (covering render, interactions, loading, empty, and error states).
2. **Expand Playwright E2E Suite:** Add full multi-step business journeys (Signup -> Create Inventory -> Generate Bill -> Settle Bill -> Verify Reports) and wire into CI.
3. **Configure Mutation Testing (Stryker):** Add `@stryker-mutator/core` and verify mutation score >=85% on `@insightloop/shared` and core API services.
4. **Full Dual-Stack Comparative Benchmark:** Run automated comparative benchmark against Daphne/Django measuring p50/p95/p99 latency, throughput, and memory across 3 repetitions.
5. **Fix Web Dockerfile:** Configure non-root `USER appuser` in `apps/web/Dockerfile`.
6. **Register Missing Contract Fixtures:** Add `bills/bills_list_kacha.json`, `bills/bills_list_pakka.json`, and `contact/contact_submit.json` to `contracts/runner.ts`.

### **Priority 2 (P2) — Enhancements & Cleanups**
1. **GridFS / S3 File Storage:** Replace local disk storage in `apps/api/src/modules/upload` with MongoDB GridFS or S3 bucket storage.
2. **Full 12-Collection Snapshot Parity:** Expand snapshot parity runner to cover `business_data`, `insights`, `financial_summaries`, and `contact_message`.
3. **Redis Teardown:** Add Redis disconnect to graceful shutdown handler.

---

## Section K: Recommended Remediation Plan

The recommended remediation follows a strict dependency order:

```
[Phase 5.5A: Core Security & DB Guarantees]
  ├── Task 1: Auth rate limiting (express-rate-limit)
  ├── Task 2: Fail-fast env validation in production
  ├── Task 3: Atomic stock decrement with non-negative guard ($gte)
  ├── Task 4: MongoDB multi-document transactions in bills & workers
  └── Task 5: AI WebSocket live user lookup on handshake

[Phase 5.5B: Test Expansion & Hardening]
  ├── Task 6: 100-parallel bills & 100-parallel SKUs concurrency tests
  ├── Task 7: Stock depletion 2-buyer race condition test
  ├── Task 8: Missing auth security edge tests (NoSQL injection, timing, token reuse)
  └── Task 9: Lift branch coverage to >=98% on bills, workers, profit, auth

[Phase 5.5C: Tooling, CI & Mutation Testing]
  ├── Task 10: Configure Stryker mutation testing and verify score
  ├── Task 11: Add coverage threshold check & Playwright E2E to CI workflow
  ├── Task 12: Fix non-root USER directive in apps/web/Dockerfile
  └── Task 13: Register 3 unexecuted fixtures into contract runner

[Phase 5.5D: Frontend & E2E Assurance]
  ├── Task 14: RTL component tests for 13 feature pages + ErrorBoundary
  └── Task 15: Full business flow Playwright E2E test suite

[Phase 5.5E: Benchmark & Snapshot Completion]
  ├── Task 16: Comparative Django vs Node load benchmark (p50/p95/p99, memory, 3 runs)
  └── Task 17: Full 12-collection snapshot parity script
```

---

## Section L: Final Decision Checklist

Before authorizing Phase 6, all of the following checkboxes must be independently verified and checked:

- [ ] **Git Integrity:** `git diff --stat pre-mern-migration-2026-10-15..HEAD -- insightloop/` remains strictly 0 diffs.
- [ ] **Auth Rate Limiting:** Rate limiting verified active and tested on `/api/auth/login`.
- [ ] **Fail-Fast Environment:** Server refuses to start in production if `JWT_SECRET` is unset or default.
- [ ] **Stock Guard:** Stock decrement query provably prevents negative inventory under concurrency.
- [ ] **Transactions:** Bill creation and status mutations executed inside MongoDB transaction sessions.
- [ ] **Coverage:** `pnpm test:coverage` reports >=95% lines and >=98% branches on critical modules and is enforced in CI.
- [ ] **Mutation Testing:** Stryker mutation score verified >=85% on critical paths.
- [ ] **Frontend Tests:** All 14 feature pages have React Testing Library tests covering standard, loading, and error states.
- [ ] **E2E Tests:** Complete transactional Playwright journey executes cleanly in CI.
- [ ] **Comparative Benchmark:** Node provably matches or exceeds Django throughput with lower p95/p99 latency.
- [ ] **Contracts:** All 69 golden master fixtures execute cleanly with zero diffs in assert mode.
- [ ] **Audit Report Accepted:** Independent audit findings reviewed and signed off.

**Phase 6 remains LOCKED until every item on this checklist is completed and verified with fresh, sanitized evidence files.**
