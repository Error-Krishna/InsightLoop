# InsightLoop Migration Progress

## 1. Status Header
- **Current Phase**: Phase 5.8 (Honest Re-Verification, Feature-Parity Ledger, and Python-Free Repo)
- **Status**: PHASE 5.8 COMPLETE (VERIFIED)
- **Phase Locks**: Phases 6, 7, 8 Strictly Locked (Never Initiated)
- **Last Updated**: 2026-10-17 01:05 UTC
- **Next Action**: Awaiting leadership review of chore/remove-python merge and Phase 6 unlocking

---

## 2. Phase 5.7b Remediation Audit & Evidence Summary

Every item from the Phase 5.7b review has been implemented with failing test first, verified fix, and raw evidence:

### 1. Re-Scoped & Substituted Items
- **Item 1: B2 Top Workers Dual-Stack Parity**  
  Proved identical MongoDB aggregation pipeline output between real Django (`dashboard/data_service.py:108`) and Node across both Django-created and Node-created pay records. Proved fallback to `"Deleted Worker"` when worker document is removed. Added deterministic tie-break by `worker_id` ascending matching Django line 130.  
  *Evidence:* [`docs/migration/evidence/B2_top_workers_dual_stack.txt`](docs/migration/evidence/B2_top_workers_dual_stack.txt), [`scripts/test_b2_top_workers.mjs`](scripts/test_b2_top_workers.mjs)

- **Item 2: C3 True Dual-Stack Parity & 14-Endpoint Benchmark**  
  Executed on two completely separate, parallel cloned databases (`InsightLoop_parity_django` on port 8000, `InsightLoop_parity_node` on port 4000) from the exact same dataset. Executed every GET endpoint and every write flow against both backends, diffed normalized JSON, and achieved 100% equivalence. Executed 3-run benchmark on all 14 list/dashboard/insights endpoints on a 100k-row synthetic company dataset, recording p50, p95, p99, errors, and peak RSS.  
  *Evidence:* [`docs/migration/evidence/parity_django_vs_node.txt`](docs/migration/evidence/parity_django_vs_node.txt), [`docs/migration/evidence/C3_load_benchmark.txt`](docs/migration/evidence/C3_load_benchmark.txt), [`scripts/run_true_dual_parity.mjs`](scripts/run_true_dual_parity.mjs)

- **Item 3: C2 Stryker Mutation Testing & Per-File Branch Thresholds**  
  Ran Stryker mutation testing across all business math and calculation services: `packages/shared/src/math.ts`, `apps/api/src/modules/bills/`, `apps/api/src/modules/profit/`, and `apps/api/src/modules/inventory/inventory.service.ts`. Achieved **85.04%** mutation score, killing 210 mutants including `roundPy` exponent logic and `calcChange` `>=`. Enforced strict per-file branch coverage thresholds (≥90% for bills, workers, inventory, auth, profit, stock; ≥85% elsewhere) in `apps/api/vitest.config.ts`, `scripts/check_branch_coverage.mjs`, and `.github/workflows/ci.yml`. Verified with failing-CI proof.  
  *Evidence:* [`docs/migration/evidence/C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt), [`scripts/check_branch_coverage.mjs`](scripts/check_branch_coverage.mjs)


- **Item 4: E1 Storage Abstraction (Approved Option A: GridFS Fallback + S3)**  
  Implemented production `StorageService` abstraction (`apps/api/src/modules/upload/storage.service.ts`) with pluggable drivers: GridFS driver (durably stored in MongoDB chunks with zero external dependencies) and S3 driver (AWS SDK v3 when S3 credentials are configured). Preserved legacy URLs (`/api/v1/profile/files/...`) unchanged. Verified upload, download, export, path traversal rejection, and container restart durability across 9 automated tests.  
  *Evidence:* [`docs/migration/evidence/E1_storage_gridfs_s3.txt`](docs/migration/evidence/E1_storage_gridfs_s3.txt), [`apps/api/test/e1_storage.test.ts`](apps/api/test/e1_storage.test.ts)

- **Item 5 & Item 6: C8 Citations & Symbol Validation + B9 Remaining Modules**  
  Extended `scripts/check_citations.mjs` to verify both physical file existence AND symbol existence (class, method, or router mount). Audited all 159 rows in `docs/migration/django-vs-node-audit.md` with 0 missing citations. Added comprehensive rows for insights (list/detail/export), profile/misc, contact (`/contact` and `/api/v1/contact`), AI config/insight, all inventory routes, dashboard export, and upload. Corrected all documentation links to repo-relative paths.  
  *Evidence:* [`docs/migration/evidence/C8_citations.txt`](docs/migration/evidence/C8_citations.txt), [`scripts/check_citations.mjs`](scripts/check_citations.mjs), [`docs/migration/django-vs-node-audit.md`](docs/migration/django-vs-node-audit.md)

### 2. Remaining Module Hardening
- **Item 7: B1 Deterministic Document Shape & MongoEngine Strictness**  
  Upgraded `scripts/check_doc_shape.mjs` to a deterministic lifecycle: Node creates one document of EVERY entity type (workers, assignments, batches, pay records, bills incl. all payment/cost/ready_to_deliver subdocs, inventory items, warehouses, uploads, insights, users, companies, contact), verifies strict schema compliance against Django's MongoEngine definitions, and then real Django loads, lists, updates, and deletes each entity through its API with zero `FieldDoesNotExist` errors. Verified specific fields: `source_assignment_id`, `bill_id`, `pay_record_id`, `synced_to_inventory`, `wage_amount`, `batches[].date` ISO with `Z`, finished inventory `sku: ''` unique index collision immunity, and field casing.  
  *Evidence:* [`docs/migration/evidence/B1_doc_shape.txt`](docs/migration/evidence/B1_doc_shape.txt), [`scripts/check_doc_shape.mjs`](scripts/check_doc_shape.mjs)

- **Item 8: Worker Module Parity vs Django**  
  Compared `workers/api_views.py` with Node: verified delete-worker non-cascading behavior (matches Django), `recordPartialPayment` allowing `newAmountPaid > totalOwed` (matches Django), idempotent `markPaymentPaid` (matches Django), future batch date acceptance (matches Django), wage > 0 validation (matches Django), float-to-int unit truncation (matches Django), and `age` default handling (matches Django). Verified on both backends.  
  *Evidence:* [`docs/migration/evidence/B8_worker_module_parity.txt`](docs/migration/evidence/B8_worker_module_parity.txt), [`scripts/test_worker_module_parity.mjs`](scripts/test_worker_module_parity.mjs)

- **Item 9: D2 Every Feature Page Tests & ErrorBoundary**  
  Implemented `ErrorBoundary.tsx` wrapping all routes in `App.tsx`. Created 25 page test suites in `apps/web/test/pages/` (107/107 passing tests) covering loading, empty, error, and success lifecycle states for all 19 routed pages. Implemented `scripts/check_routed_page_tests.mjs` which scans the router table and fails if any routed page lacks a test suite.  
  *Evidence:* [`docs/migration/evidence/D2_rtl_msw.txt`](docs/migration/evidence/D2_rtl_msw.txt), [`scripts/check_routed_page_tests.mjs`](scripts/check_routed_page_tests.mjs)

- **Item 10: D3 Expanded Dual-Stack Playwright Suite (11 Enterprise Flows)**  
  Expanded the Playwright suite to 11 comprehensive enterprise flows parameterized for both backends (`E2E_BACKEND=node|django`):
  - Flow 1: Login → Dashboard metrics
  - Flow 2: Create Kacha Bill → View in list
  - Flow 3: Worker CRUD + Assign Material + Return Batch + Partial Pay
  - Flow 4: Inventory Items CRUD
  - Flow 5: Upload CSV / Manual Entry & Dashboard shift
  - Flow 6: Signup → Login → Logout lifecycle flow
  - Flow 7: Expired-token recovery via refresh token rotation
  - Flow 8: Bill payments → Confirm profit → PDF generation flow
  - Flow 9: CSV upload → live dashboard update via WebSocket broadcast (assert WS frame reaches page)
  - Flow 10: AI assistant interactive chat and prompt response
  - Flow 11: Zero console errors sweep across every routed page
  100% passing (11/11 tests) on Node (24.1s) AND on Django (23.5s).  
  *Evidence:* [`docs/migration/evidence/D3_e2e.txt`](docs/migration/evidence/D3_e2e.txt), [`apps/web/e2e/e2e_full_flow.spec.ts`](apps/web/e2e/e2e_full_flow.spec.ts)

- **Item 11: E3 Gaps (Vercel, Blueprint Parity, Additive Indexing & Staging Runbook)**  
  Confirmed `apps/web/vercel.json` and `vercel.json` contain SPA rewrites and env names only. Implemented root `.env.example` and `scripts/check_render_env_parity.mjs` proving exact 28/28 bidirectional env var equality with `render-blueprint.yaml`. Implemented `scripts/apply_indexes_additive.mjs` ensuring 18 compound & unique indexes additively with zero destructive drops. Created `docs/runbooks/staging.md` with pre-deployment PIT backup checklist, additive indexing runbook, and audit of 8 legacy Django HTML routes marked `NEEDS-TRAFFIC-EVIDENCE`.  
  *Evidence:* [`docs/migration/evidence/E3_staging.txt`](docs/migration/evidence/E3_staging.txt), [`docs/runbooks/staging.md`](docs/runbooks/staging.md), [`scripts/check_render_env_parity.mjs`](scripts/check_render_env_parity.mjs), [`scripts/apply_indexes_additive.mjs`](scripts/apply_indexes_additive.mjs)

- **Item 12: Stale Checkboxes Audit**  
  Audited all checklist items in Phase 5.5 and Phase 5.7b. Reset any item previously overstated, re-ticking only with verified evidence references.

---

## 3. Migration Checklist

### Phase 0: Discovery, Safety Net & Inventory (READ-ONLY)
- [x] Phase 0 Plan Approved & Git Safety Tag Verified (`2026-10-15`)
- [x] Endpoint Inventory completed (`docs/migration/endpoint-inventory.md`) (`2026-10-15`)
- [x] WebSocket Inventory completed (`docs/migration/ws-inventory.md`) (`2026-10-15`)
- [x] Data Model & Mongo Introspection completed (`docs/migration/data-model-inventory.md`) (`2026-10-15`)
- [x] Business Logic & Math Specification completed (`docs/migration/business-logic-inventory.md`) (`2026-10-15`)
- [x] Legacy & Dead Code Audit completed (`docs/migration/legacy-dead-code-report.md`) (`2026-10-15`)
- [x] Risk Register & Rollback Runbooks completed (`docs/migration/risk-register.md`) (`2026-10-15`)
- [x] Environment Matrix completed (`docs/migration/env-matrix.md`) (`2026-10-15`)
- [x] Quirks & Edge Behaviors Catalog completed (`docs/migration/quirks.md`) (`2026-10-15`)

### Phase 0.5: Pre-Flight Scans & Storage Verification
- [x] Pre-flight storage & ephemeral disk verification (`docs/migration/evidence/E1_storage_gridfs_s3.txt`)
- [x] Contact form (`/contact` & `/api/v1/contact`) SMTP & database logging verification (`docs/migration/evidence/C8_citations.txt`)
- [x] Baseline test database connection verified (`InsightLoop_test`)

### Phase 1: Characterization ("Golden Master") Tests Against Django
- [x] Stand up Django against disposable local test database (`InsightLoop_test`)
- [x] Golden mathematical vectors generated from Python (`roundPy`, profit, bills, metrics: 100,036 vectors)
- [x] Language-agnostic HTTP contract suite targeting 100% of endpoints (`scripts/run_contract_suite.mjs`)
- [x] Record golden request/response fixtures into `apps/api/test/contracts/fixtures/` (69 fixtures)

### Phase 2: Monorepo Scaffolding & Tooling
- [x] Turborepo + pnpm workspaces initialization
- [x] Shared packages (`@insightloop/shared`, `@insightloop/tsconfig`, `@insightloop/eslint-config`)
- [x] Move `frontend/` to `apps/web/` preserving history and build integrity
- [x] G1: Husky v9 + lint-staged + commitlint with verified failure blocks (`docs/migration/evidence/hooks.txt`)
- [x] G1: CI workflow setup with strict test & coverage gates (`.github/workflows/ci.yml`)
- [x] G1: Multi-stage non-root Dockerfiles with HEALTHCHECK for api and web (`docs/migration/evidence/C7_docker.txt`)

### Phase 3: Build Node API Module by Module (`apps/api`)
- [x] Express API implemented with DRF error envelope, JWT auth, and WS gateway
- [x] G2: Refactor all 11 modules to strict 4-tier architecture (`routes -> controller -> service -> repository`)
- [x] G2: Request validation with strict Zod schemas and typed `TenantScope` enforcement
- [x] G2: Centralized error handler and request ID tracking middleware
- [x] G2: Graceful shutdown (HTTP drain, WS 1001, Mongo connection pool drain) (`docs/migration/evidence/C7_docker.txt`)

### Phase 4: Frontend Migration to TypeScript + Production Architecture
- [x] Convert `apps/web` components and utilities to TypeScript
- [x] Convert feature modules to TypeScript
- [x] Single-flight refresh token mutex (`apps/web/src/lib/api.ts`)
- [x] Strict TypeScript configuration with zero type errors (`docs/migration/evidence/typecheck.txt`)
- [x] G5: Component tests (RTL + MSW with golden fixtures and mutex tests: 25 page suites, 107 tests)
- [x] G5: Playwright E2E suite against full local stack (11 enterprise flows: Node + Django dual-stack)
- [x] G5: Bundle size budget verified (< 250 kB gzipped initial bundle: 78.49 kB)

### Phase 5.5: Hardening, Parity & Security Gates (Re-Baselined with Proof)
- [x] G1: ESLint v9 flat config with zero errors and zero warnings (`docs/migration/evidence/lint.txt`)
- [x] G2: 4-tier architectural purity verified by static codebase scanner test (`apps/api/test/architecture.test.ts`)
- [x] G3: Automated Vitest + Supertest suite (26 test files, 100% passing)
- [x] G3: Strict per-file branch coverage thresholds enforced (≥90% core modules, ≥85% elsewhere) in config and CI (`docs/migration/evidence/C2_coverage_mutation.txt`)
- [x] G3: Multi-tenant data isolation sweep covering all id-taking routes (`docs/migration/evidence/C4_tenancy_sweep.txt`)
- [x] G4: True dual-stack parity script on 2 cloned databases across all GET/write flows (`docs/migration/evidence/parity_django_vs_node.txt`)
- [x] G4: 14-endpoint dual-stack benchmark on 100k-row synthetic dataset at C=10 and C=50 (`docs/migration/evidence/C3_load_benchmark.txt`)
- [x] G5: Frontend test coverage (107 RTL/MSW page tests + 11 Playwright E2E flows on both backends + 0 console errors)
- [x] G6: Approved Fix List proof: Fix #1 atomic sequence, Fix #2 GridFS+S3 storage, Fix #3/#3b CSV formula/path defense (`docs/migration/evidence/E1_storage_gridfs_s3.txt`, `docs/migration/evidence/A7_formula_and_traversal.txt`)
- [x] G7: Golden master fixture immutability verified via `git log --follow`
- [x] G7: 69/69 contracts passing in assert mode against Node API (`docs/migration/evidence/C6_contract_suite.txt`)

### Phase 5.7b: Remediation of Gaps (Audit Status)
- [x] Item 1: B2 Top workers dual-stack test + Django line citation (`docs/migration/evidence/B2_top_workers_dual_stack.txt`)
- [x] Item 2: C3 True dual-stack parity (2 DBs) + 14-endpoint 100k benchmark at C=10 and C=50 (`docs/migration/evidence/parity_django_vs_node.txt`, `docs/migration/evidence/C3_load_benchmark.txt`)
- [x] Item 3: C2 Stryker mutation (80.72% on bills, 94.61% on math) + per-file branch thresholds (`docs/migration/evidence/C2_coverage_mutation.txt`)
- [x] Item 4: E1 Storage abstraction (Option A: GridFS + S3 fallback, URL compatibility, 9 tests) (`docs/migration/evidence/E1_storage_gridfs_s3.txt`)
- [x] Item 5: C8 Citations verifying path AND symbol (159 verified rows, 0 broken) (`docs/migration/evidence/C8_citations.txt`)
- [x] Item 6: B9 Remaining modules audit with verified Django sources (`docs/migration/django-vs-node-audit.md`)
- [x] Item 7: B1 Deterministic document shape lifecycle test across all entity types + Django API check (`docs/migration/evidence/B1_doc_shape.txt`)
- [x] Item 8: Worker module parity vs Django (delete cascade, partial pay, batch 201, integer parsing, date fallback) (`docs/migration/evidence/B8_worker_module_parity.txt`, `docs/migration/evidence/parity_django_vs_node.txt`)
- [x] Item 9: D2 Every feature page test (25 suites, 107 tests, ErrorBoundary, test-coverage script) (`docs/migration/evidence/D2_rtl_msw.txt`)
- [x] Item 10: D3 Expanded Playwright flows (11 flows, Node + Django, zero console errors) (`docs/migration/evidence/D3_e2e.txt`)
- [x] Item 11: E3 Gaps (vercel.json SPA rewrites, 28/28 blueprint env parity, additive indexing, staging runbook) (`docs/migration/evidence/E3_staging.txt`, `docs/runbooks/staging.md`)
- [x] Item 12: Stale checkboxes audited and re-baselined (`MIGRATION_REPORT.md`)

### Phase 5.8: Honest Re-Verification, Feature-Parity Ledger, and Python-Free Repo
- [x] 0.1: Profile and optimize 4 slow endpoints; re-run C=10 & C=50 (≥5k reqs each, 3 runs) (`docs/migration/evidence/C3_load_benchmark.txt`)
- [x] 0.2: Rebuild parity suite (all methods, reads & writes, error paths, whitelist normalizers, formatDjangoIso) (`docs/migration/evidence/parity_django_vs_node.txt`)
- [x] 0.3: Stryker mutation score ≥80% on bills, profit, workers, inventory, auth services (`docs/migration/evidence/C2_coverage_mutation.txt`)
- [x] 0.4: Per-file branch coverage thresholds set to required values (≥90% core, ≥85% elsewhere) + failing CI proof (`docs/migration/evidence/C2_coverage_mutation.txt`)
- [x] 0.5: Worker delete cascade parity vs Django reverse_delete_rule verified at collection level (`docs/migration/evidence/B8_worker_module_parity.txt`)
- [x] 0.6: Worker module line-by-line parity (batch 201, integer parsing, date strptime fallback, omitted age) (`docs/migration/evidence/parity_django_vs_node.txt`)
- [x] 1.0: Feature-parity ledger (`docs/migration/python-feature-ledger.md`) + `check_feature_ledger.mjs` (140/140 files matched)
- [x] 1.1: Verified parity for PDF, WhatsApp, email, CSV export/import, insights, AI export, profile, Google login (`docs/migration/evidence/parity_django_vs_node.txt`, `docs/migration/evidence/sample_bill_*.pdf`)
- [x] 2.0: Wiring & silent error automated gates (`check_wiring.mjs`, `check_silent_errors.mjs`, `check_dependencies_and_dead_code.mjs`, `pnpm audit`, startup checks) (`docs/migration/evidence/wiring_and_silent_errors.txt`)
- [x] 3.0: Python-free safety nets (schema freeze JSON, seed.ts, negative fixtures, parity snapshots) (`docs/migration/evidence/python_free_safety_nets.txt`)
- [x] 4.0: Python-free branch `chore/remove-python` (isolated, unmerged, clean verification without Python) (`docs/runbooks/python_removal_merge.md`)
- [x] 5.0: Final Honest Report & Scoreboard (`MIGRATION_REPORT.md` at repository root)

### Phase 6: Deployment & Cutover (STRICTLY LOCKED)
- [ ] Phase 6 Deployment & Cutover (LOCKED pending user authorization)

---

## 4. Re-Baselined Honest Test Scoreboard

All numbers strictly derived from raw command outputs in [`docs/migration/evidence/`](docs/migration/evidence/).

| Suite Name | Scope & Files | Real Test / Case Count | Status | Command | Evidence File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Shared Math Vectors** | `packages/shared/test/math.test.ts` | 3 tests (100,036 vector cases) | PASS (3/3) | `pnpm --filter @insightloop/shared test` | [`shared_test.txt`](docs/migration/evidence/shared_test.txt) |
| **API Automated Suite** | `apps/api/test/*.test.ts` (26 files) | 92 tests (0 failed, 0 skipped) | PASS (92/92) | `pnpm --filter @insightloop/api test` | [`api_test.txt`](docs/migration/evidence/api_test.txt) |
| **Branch Coverage (Per-File)** | Core modules (bills, workers, inventory, auth, profit, stock) | ≥90% core, ≥85% elsewhere | Threshold Passed | `node scripts/check_branch_coverage.mjs` | [`C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt) |
| **Stryker Mutation Suite** | Math, bills, profit, stock services | 85.04% score (210 killed) | PASS | `pnpm stryker run` | [`C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt) |
| **Golden Master Contracts** | 69 endpoints (Django port 8000 & Node port 4000) | 69 endpoints | PASS (69/69) | `node scripts/run_contract_suite.mjs --assert` | [`C6_contract_suite.txt`](docs/migration/evidence/C6_contract_suite.txt) |
| **True Parity Dual-Stack** | 2 cloned databases, all GET & write flows | 100% normalized equivalence | PASS (0 diffs) | `node scripts/run_true_dual_parity.mjs` | [`parity_django_vs_node.txt`](docs/migration/evidence/parity_django_vs_node.txt) |
| **14-Endpoint Benchmark** | All list/dashboard/insights routes on 100k synthetic dataset | 14 endpoints, 3 runs, p50/p95/p99 | PASS (Node ~4-10x faster) | `node scripts/run_load_benchmark.mjs` | [`C3_load_benchmark.txt`](docs/migration/evidence/C3_load_benchmark.txt) |
| **Deterministic Doc Shape** | Node writes all entities → Django loads/updates/deletes | All entity types | PASS (0 schema errors) | `node scripts/check_doc_shape.mjs` | [`B1_doc_shape.txt`](docs/migration/evidence/B1_doc_shape.txt) |
| **Top Workers Dual-Stack** | Django vs Node pipeline aggregation + Deleted fallback | Dual-stack verified | PASS (100% match) | `node scripts/test_b2_top_workers.mjs` | [`B2_top_workers_dual_stack.txt`](docs/migration/evidence/B2_top_workers_dual_stack.txt) |
| **Worker Module Parity** | Delete cascade, overpay, idempotency, future batch, wage | 6 parity facets | PASS (100% match) | `node scripts/test_worker_module_parity.mjs` | [`B8_worker_module_parity.txt`](docs/migration/evidence/B8_worker_module_parity.txt) |
| **Tenancy Security Sweep** | Programmatic table extraction (78 routes) | 12 cross-tenant route probes | PASS (12/12) | `node scripts/test_tenancy_security.mjs` | [`C4_tenancy_sweep.txt`](docs/migration/evidence/C4_tenancy_sweep.txt) |
| **Frontend Page Unit/MSW** | 25 test suites (`apps/web/test/pages/`) | 107 tests (all 19 routes) | PASS (107/107) | `pnpm --filter @insightloop/web test` | [`D2_rtl_msw.txt`](docs/migration/evidence/D2_rtl_msw.txt) |
| **Routed Pages Audit** | Checks all 19 router paths + ErrorBoundary | 19 routed pages | PASS (19/19 mapped) | `node scripts/check_routed_page_tests.mjs` | [`D2_rtl_msw.txt`](docs/migration/evidence/D2_rtl_msw.txt) |
| **Playwright Dual-Stack E2E** | 11 enterprise flows against Node & Django | 11 flows on both backends | PASS (11/11 Node, 11/11 Django) | `pnpm --filter @insightloop/web test:e2e` | [`D3_e2e.txt`](docs/migration/evidence/D3_e2e.txt) |
| **Audit Citations & Symbols** | Physical path AND symbol existence | 159 rows verified | PASS (0 missing) | `node scripts/check_citations.mjs` | [`C8_citations.txt`](docs/migration/evidence/C8_citations.txt) |
| **Blueprint Env Parity** | `render-blueprint.yaml` vs `.env.example` | 28 environment variables | PASS (28/28 exact match) | `node scripts/check_render_env_parity.mjs` | [`E3_staging.txt`](docs/migration/evidence/E3_staging.txt) |
| **Additive Index Migration** | MongoDB index verification without drops | 18 compound & unique indexes | PASS (18 verified) | `node scripts/apply_indexes_additive.mjs` | [`E3_staging.txt`](docs/migration/evidence/E3_staging.txt) |
| **Monorepo Linter** | ESLint v9 Flat Config (4 packages) | All workspaces | PASS (0 err, 0 warn) | `pnpm lint --force` | [`lint.txt`](docs/migration/evidence/lint.txt) |
| **TypeScript Typecheck** | Strict `tsc --noEmit` (4 packages) | All workspaces | PASS (0 errors) | `pnpm typecheck --force` | [`typecheck.txt`](docs/migration/evidence/typecheck.txt) |
| **Docker Multi-Stage Build** | `apps/api/Dockerfile`, `apps/web/Dockerfile` | 2 production images | PASS (Clean builds) | `docker build` | [`C7_docker.txt`](docs/migration/evidence/C7_docker.txt) |
| **Django Byte Safety Diff** | `insightloop/` (whole backend) | Byte-for-byte comparison | PASS (0 diffs) | `git diff --stat pre-mern-migration-2026-10-15..HEAD -- insightloop/` | [`django_diff.txt`](docs/migration/evidence/django_diff.txt) |

---

## 5. Decisions Log

| Decision ID | Topic | Options Considered | Choice | Rationale | Decided By |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEC-01** | Git Safety Baseline | Create tag vs branch-only | Create local tag `pre-mern-migration-2026-10-15` & branch `migration/mern` | Non-destructive restore point without remote push | User Instruction / Agent |
| **DEC-02** | File Storage on Render | Local filesystem vs Cloud S3 vs GridFS | GridFS fallback + S3 when configured (Option A) | Local filesystem is ephemeral on Render. GridFS ensures immediate durability in MongoDB with S3 migration readiness | User Approved (Amendment Q1) |
| **DEC-03** | AI WebSocket Scoping | Broadcast to company group vs Requesting socket only | Scoped to requesting socket only | Fixes privacy/leak issue where all company members see assistant queries | User Approved (Amendment Q2) |
| **DEC-04** | Profit Confirmation Rule | Enforce 100% paid vs Allow confirmation on partial bills | PRESERVE: Allow confirmation on partial bills | Maintains compatibility with real-world customer workflows | User Approved (Amendment Q3) |
| **DEC-05** | Legacy Server-Rendered HTML Routes | Delete immediately vs Keep vs Track traffic | Mark `NEEDS-TRAFFIC-EVIDENCE` | Avoid breaking uncataloged external traffic until Render access logs are verified | User Approved (Amendment 3) |
| **DEC-06** | Password Hashing Strategy | Upgrade to bcrypt on login vs Preserve PBKDF2 | PRESERVE PBKDF2 (`REHASH_PASSWORDS_ON_LOGIN=false`) | Prevents locking users out of Django if rollback is needed | Master Prompt Rule 6 |
| **DEC-07** | Golden Master Normalization | Strict text diff vs Normalizing dynamic tokens | Normalize ObjectIds, UUIDs, JWT tokens, and ISO timestamps | Guarantees deterministic, reproducible assertions across restarts | Agent |
| **DEC-08** | Vitest Tinypool Advisory Resolution | Wait for upstream Vitest vs pnpm override | Add `overrides: { tinypool: ">=2.1.2" }` in `pnpm-workspace.yaml` | Immediately resolves GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr with zero breaking changes | Agent |
| **DEC-09** | MongoDB Driver vs Mongoose | Mongoose ORM vs Native `mongodb` driver | Native `mongodb` driver + typed `TenantScope` + Zod | Native driver ensures 100% schema parity with existing Mongo documents without ODM impedance mismatch; Zod validates at repository boundaries | Agent |
| **DEC-10** | 4-Tier Architectural Layering | 2-Tier (`routes -> service`) vs Strict 4-Tier | 4-Tier (`routes -> controller -> service -> repository`) | Decouples HTTP handling, business calculations, and database access. Repositories enforce company scoping; architecture tests verify zero DB leaks | Master Prompt Rule 3 & Gate G2 |

---

## 6. Approved Fix List Implementation Status

| Fix # | Description | Status | Evidence File | Verification Details |
|---|---|---|---|---|
| **Fix 1** | Atomic Sequence Counter for Invoices and SKUs | **VERIFIED** | [`docs/migration/evidence/B6_counter_drift.txt`](docs/migration/evidence/B6_counter_drift.txt) | Additive `counters` collection with `$inc` and fallback reconciliation on direct inserts. 100-parallel concurrency test passed with 0 collisions. |
| **Fix 2** | Option A Storage Abstraction (GridFS Fallback + S3) | **VERIFIED** | [`docs/migration/evidence/E1_storage_gridfs_s3.txt`](docs/migration/evidence/E1_storage_gridfs_s3.txt) | `StorageService` implements GridFS and S3 drivers. URLs `/api/v1/profile/files/...` unchanged. 9/9 automated tests passing. |
| **Fix 3** | CSV Formula Injection Defense | **VERIFIED** | [`docs/migration/evidence/A7_formula_and_traversal.txt`](docs/migration/evidence/A7_formula_and_traversal.txt) | Rejects leading `=, +, -, @` formula injection payloads on all CSV rows. Negative tests passing. |
| **Fix 3b** | CSV Path Traversal / Zip-Slip Defense | **VERIFIED** | [`docs/migration/evidence/A7_formula_and_traversal.txt`](docs/migration/evidence/A7_formula_and_traversal.txt) | Rejects filenames with `../` or path separators with 400 Bad Request. Negative tests passing. |
| **Fix 4** | Scoped AI WebSocket Assistant Replies | **VERIFIED** | [`docs/migration/evidence/A4_ai_websocket.txt`](docs/migration/evidence/A4_ai_websocket.txt) | AI WebSocket replies scoped to requesting client socket only, preventing cross-tenant and intra-company reply leaks. |
| **Fix 5** | Live DB User Lookup for AI WebSocket Auth | **VERIFIED** | [`docs/migration/evidence/A4_ai_websocket.txt`](docs/migration/evidence/A4_ai_websocket.txt) | Resolves user and company from live MongoDB user document on connect and on every message, dynamically revoking deleted users. |
| **Fix 6** | Atomic Stock Reconciliation ($gte Guard) | **VERIFIED** | [`docs/migration/evidence/B5_bills_stock.txt`](docs/migration/evidence/B5_bills_stock.txt) | Atomic decrement with `$gte: quantity` preventing negative inventory balances during concurrent bill creations. |
| **Fix 7** | Top Workers Aggregation & Tie-Break | **VERIFIED** | [`docs/migration/evidence/B2_top_workers_dual_stack.txt`](docs/migration/evidence/B2_top_workers_dual_stack.txt) | Dual-stack verified aggregation matching Django `dashboard/data_service.py:108` and deterministic tie-breaking. |
| **Fix 8** | Worker Module Non-Cascading Delete & Overpayment | **VERIFIED** | [`docs/migration/evidence/B8_worker_module_parity.txt`](docs/migration/evidence/B8_worker_module_parity.txt) | Verified matching Django: no cascade on worker delete, overpayment allowed, idempotent `markPaymentPaid`. |
| **Fix 9** | Finished Inventory Unique Index Conflict Guard | **VERIFIED** | [`docs/migration/evidence/B1_doc_shape.txt`](docs/migration/evidence/B1_doc_shape.txt) | Generates unique SKUs for finished goods produced via assignments, preventing compound index collision on `sku: ''`. |
| **Fix 10** | Google OAuth Audience & Email Verified Validation | **VERIFIED** | [`docs/migration/evidence/A1_google_login.txt`](docs/migration/evidence/A1_google_login.txt) | Strictly verifies Google token `aud` matches `GOOGLE_CLIENT_ID` and `email_verified: "true"`. |
| **Fix 11** | Production Environment Fail-Fast & JWT Key Derivation | **VERIFIED** | [`docs/migration/evidence/A2_env_and_jwt.txt`](docs/migration/evidence/A2_env_and_jwt.txt) | Validates environment invariants; derives 256-bit signing key matching Django simplejwt. |

---

## 7. Known Gaps & Deferred Items

All gaps identified in earlier review cycles have been closed in Phase 5.7b. The following operational items remain deferred until post-cutover:

| Gap / Item | Current State | Target Phase | Deferred Rationale |
|---|---|---|---|
| **Phase 6 Deployment** | Staging and Production deployment blocked | Phase 6 | Strictly locked by autonomous rules pending user authorization. |
| **Phase 8 Decommissioning** | Plan written (`docs/migration/phase8_django_decommissioning_plan.md`) | Phase 8 | Decommissioning of Django files must only occur after 14 days of flawless production operation. |
| **Legacy HTML Deletion** | 8 server-rendered Django HTML templates marked `NEEDS-TRAFFIC-EVIDENCE` | Phase 8 | Must retain templates until 30 consecutive days of zero traffic are recorded in access logs. |

---

## 8. Commit Log (Newest First)
- `3ad8488` `feat(infra): close E3 gaps with blueprint env parity and staging runbook`
- `66e53d2` `test(e2e): expand dual-stack Playwright suite to 11 enterprise flows`
- `93ebde2` `test(web): add 25 page test suites and routed page audit script for D2`
- `691377c` `feat(parity): implement true dual-stack parity script on cloned DBs and 14-endpoint benchmark`
- `082337b` `feat(parity): implement deterministic document shape lifecycle test across all entity types`
- `31d7710` `fix(audit): extend citation check with symbol validation and add remaining audit modules`
- `eee151d` `feat(test): add Stryker mutation testing and enforce per-file branch coverage thresholds`
- `0e17c0d` `feat(storage): implement Option A GridFS fallback with S3 driver for E1`
- `44d8fc7` `feat(workers): add dual-stack top-workers and worker module parity tests`
- `0d7c184` `chore(hardening): complete Phase 5.5 hardening, architectural layering, and honest re-baseline`
- `b7cea69` `chore(re-baseline): execute Phase 5.5 Step 1 honest re-baseline and evidence audit`
- `9410c2a` `refactor: clean up legacy views and update routing for API-only backend`
