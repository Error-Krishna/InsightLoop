# InsightLoop Migration Progress

## 1. Status Header
- **Current Phase**: Phase 7 (Latency Diagnostic, Performance Optimization & Python Removal Gate)
- **Status**: PHASE 7 PERFORMANCE FIXES & PYTHON REMOVAL PREPARED
- **Deployment & Perf Status**:
  - Live Render latency benchmarked across 10 runs (cold start 52.2s, warm median /health 292ms, auth 1.6s, overview 1.97s, bills 757ms, pdf 1.25s).
  - Performance fixes committed on `perf/live-latency` (additive indexes, font resolution caching, N+1 query elimination, gzip compression, request timing middleware).
  - Python removal prepared and verified on `chore/remove-python` from a clean clone with Python disabled: frozen-lockfile build, typecheck, lint, 356 API tests, 111 web tests, 16/16 production boot smoke test, and container builds of `insightloop-api` and `insightloop-web`.
- **Phase Locks**: No remote push, no autonomous deploy executed, no branches merged. User will review PR and merge on GitHub.
- **Branches**: `main` (deploy-ready baseline), `perf/live-latency` (performance fixes from main), `chore/remove-python` (recreated with perf fixes + Python code purged).
- **Safety Tag**: `pre-mern-migration-2026-10-15` (commit `9410c2a33f6fef2ceed8a07843cfb52f7a04be71`) verified intact.
- **Last Updated**: 2026-10-18 00:10 UTC
- **Next Action**: User reviews PRs on GitHub, merges `perf/live-latency` and `chore/remove-python`, and considers recommended Render/Atlas infrastructure adjustments.

---

## 2. Phase 6 Deploy Prep & Production Smoke Test Summary

Phase 6 deployment preparation and verification have been completed on `main` without pushing, deploying, or modifying live databases:

### 1. Main Branch Deploy-Readiness Verification
- **Frozen-lockfile installation**: `pnpm install --frozen-lockfile` completed in 1.2s.
- **Full Monorepo Build**: `pnpm build` completed with zero errors across `@insightloop/shared`, `@insightloop/api`, and `@insightloop/web`.
- **TypeScript Typecheck**: `pnpm typecheck` passed with 0 errors across all workspaces.
- **ESLint**: `pnpm lint` passed with 0 errors.
- **Frontend Web Tests**: `pnpm --filter @insightloop/web test` passed (26/26 test suites, 110/110 tests passed).
- **Backend API Tests**: `pnpm --filter @insightloop/api test` passed (62/62 test suites, 353/353 tests passed).

### 2. Python Artifacts Audit on `main`
- **Django Codebase**: Python files remain present under `insightloop/` and `scripts/*.py` on `main`. This is intentional and compliant with the project canary mandate: `main` merged `migration/mern` (which preserves Django for the 14-day canary rollback window), while the Python-free codebase is maintained in branch `chore/remove-python`.
- **Python Dependencies**: `requirements.txt` and `requirements-lock.txt` remain at root to support the standby Django service during canary soak.
- **Dockerfiles**: `apps/web/Dockerfile` and `apps/api/Dockerfile` are pure Node.js 22 LTS container specifications.
- **CI Workflows**: `.github/workflows/ci.yml` retains dual-stack parity steps (`setup-python`, Daphne server) to guarantee parity on `main` during canary soak.

### 3. Render Blueprint Audit (`render-blueprint.yaml`)
- **Build Command**: `pnpm install --frozen-lockfile && pnpm --filter @insightloop/shared build && pnpm --filter @insightloop/api build` verified from clean clone.
- **Start Command**: `node apps/api/dist/server.js` verified.
- **Health Check Path**: `healthCheckPath: /health` serves HTTP 200 with `{"status":"ok","service":"InsightLoop Node API"}`.
- **Environment Parity**: All 45 configuration keys in `apps/api/src/config/env.ts` verified in 1:1 parity with `render-blueprint.yaml` and `.env.example`.

### 4. Render Production Boot Verification
- **Insecure / Missing Secret Rejection**: Spawning the production API without `JWT_SECRET` immediately exits with code `1` and outputs `ZodError: JWT_SECRET is required in production.`
- **Minimal Variable Production Boot**: Spawned `node apps/api/dist/server.js` with `NODE_ENV=production` and ONLY the variables user sets on Render (`MONGODB_URI`, `MONGODB_DB_NAME`, `JWT_SECRET`, `CORS_ORIGIN`, `FRONTEND_ORIGIN`, `GOOGLE_CLIENT_ID`, `METRICS_TOKEN`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`) against local MongoDB database `InsightLoop_phase6_boot_demo`.
- **Verified Endpoints**:
  - `GET /health` returned `200 OK` (`{"status":"ok","service":"InsightLoop Node API"}`).
  - `GET /` returned `302 Found` with `Location: https://insightloop.vercel.app` (mirroring Django `root_redirect`).
  - Request with `Origin: https://insightloop.vercel.app` returned CORS header `Access-Control-Allow-Origin: https://insightloop.vercel.app`.
  - Unauthenticated `GET /metrics` was refused with `401 Unauthorized`.
  - `GET /metrics` with `x-metrics-token` returned `200 OK`.
  - User signup (`POST /api/v1/auth/signup`) returned `201 Created` with JWT tokens and company record.
  - User login (`POST /api/v1/auth/login`) returned `200 OK` with valid access token.
  - Graceful shutdown (`SIGTERM`) drained connections and closed MongoDB/Redis pools cleanly.

### 5. Deployment Runbook (`docs/runbooks/deploy_checklist.md`) & Documentation Invariants
Created plain-language deployment guide for user cutover:
- Step-by-step instructions for Render Blueprint deployment from `main`.
- Master table of all environment variables to configure in Render Dashboard.
- Single-command generation for `JWT_SECRET` and `METRICS_TOKEN`: `openssl rand -hex 32`.
- Step-by-step Gmail App Password creation guide.
- **`VITE_API_BASE_URL` Invariant**: Documented exact format `https://<render-url>/api/v1` (MUST end in `/api/v1` as Axios client in `apps/web/src/lib/api.ts` appends endpoint routes). `VITE_WS_BASE_URL` stays `wss://<render-url>` with no path. Automated check added to `scripts/check_web_env_vars.mjs` and `apps/web/test/env_urls.test.ts` failing if any doc shows `VITE_API_BASE_URL` without `/api/v1`.
- **Vercel Monorepo Build Configuration**: Configured `vercel.json` with Root Directory `./`, `installCommand: "pnpm install --frozen-lockfile"`, `buildCommand: "pnpm --filter @insightloop/shared build && pnpm --filter @insightloop/web build"`, `outputDirectory: "apps/web/dist"`, and SPA rewrites. Removed obsolete `@secret` references from `vercel.json`. Verified clean build produces `apps/web/dist/index.html` with Vite correctly inlining `VITE_*` variables.
- Google Cloud Console Authorized JavaScript Origins setup guide to prevent OAuth mismatches.
- Instant rollback instructions for Render and Vercel.

### 6. Automated Production Smoke Test (`scripts/smoke_test.mjs`)
Created zero-external-dependency automated smoke test runner:
- Built with native Node.js 22 LTS features (`node:crypto`, `fetch`, `FormData`, `Blob`, `WebSocket`).
- **Bill Payment & Balance Assertions**: Reads real fields `amount_received` and `balance_due` from bill response. Asserts `paidAmount === 150`, `balanceDue === 150`, and `grandTotal === 300` matching sent values, eliminating any "Paid: undefined" output.
- **Executed 16 verification checks against the production-booted server: 16/16 PASSED (0 failures)**:
  - Step 1: `GET /health` (200), `GET /` (302 redirect to Vercel).
  - Step 2: CORS preflight with `Origin` and `Access-Control-Request-*` headers (204).
  - Step 3: Throwaway user signup (201), login (200), token refresh (200).
  - Step 4: Create worker (201), create inventory item (201), create bill with payment asserting paid=150 and balance=150 (201), fetch bill PDF and verify `%PDF` magic bytes (200, 33KB), fetch dashboard overview and verify active workers and bills count (200).
  - Step 5: Multipart CSV upload (200, 2 records), verify dashboard revenue updated to ₹750 (200), connect to WebSocket gateway (`/ws/dashboard/:companyId/`) with JWT and receive live initial state frame.
  - Step 6: `POST /contact` returns `{"status":"ok"}` with background SMTP error logged gracefully.
  - Step 7: Teardown and delete all created entities (Bill 204, Inventory 204, Worker 204).
- **Down-Server Handling**: Verified execution against inactive port (`http://127.0.0.1:59999`) outputs clear failure message and exits with code `1`.

---

## 3. Phase 5.11 Implementation & Production Config Parity Summary

All Phase 5.11 items have been implemented, verified with tests, and validated with committed disk evidence:

### 1. Time Zone Parity & Server UTC Baseline (Section 1)
- **Django UTC Server Analysis**:
  - Audited all date handling and aggregation grouping across `dashboard/*.py`, `insights/*.py`, `upload/*.py`, and `bills/*.py`.
  - In `settings.py`, `TIME_ZONE = "UTC"` and `USE_TZ = True`. On Render (UTC Linux container), `datetime.now()` returns naive UTC, `timezone.localdate()` evaluates in UTC, and MongoDB `$year`, `$month`, `$dayOfMonth`, and `$week` operators without timezone arguments default to UTC. Documented in `docs/migration/django-vs-node-audit.md` Section 10.
- **Node Configuration & Utilities**:
  - Updated `apps/api/src/config/env.ts` to default `APP_TIME_ZONE` to `'UTC'`.
  - Updated `render-blueprint.yaml` and `.env.example` to default `APP_TIME_ZONE=UTC`.
  - All MongoDB aggregations (`$year`, `$month`, `$dayOfMonth`, `$week`) in `dashboard.service.ts` declare `timezone: env.APP_TIME_ZONE`.
  - Boundary functions `getMonthBoundaries` and `buildZonedDateRange` in `timezone.ts` compute exact millisecond boundaries matching Django.
- **Dual-Stack Parity & Midnight/Month-End Boundaries**:
  - Ran dual-stack parity script `scripts/test_timezone_dual_parity.mjs` against Django and Node with both forced to `TZ=UTC` and `APP_TIME_ZONE=UTC`: **0 mismatches** across all 5 dashboard endpoints (`/dashboard/summary`, `/dashboard/rev-exp`, `/dashboard/profit-trends`, `/dashboard/workers`, `/dashboard/top-workers`).
  - Evaluated boundary records placed at `2026-10-31T23:59:59.000Z` (1s before midnight UTC) and `2026-11-01T00:00:01.000Z` (1s after midnight UTC): **0 mismatches across month boundary**.
  - Re-ran dual-stack parity with both forced to `TZ=Asia/Kolkata` and `APP_TIME_ZONE=Asia/Kolkata`: **0 mismatches**.
  - 5/5 unit and integration tests passed in `apps/api/test/b3_timezone.test.ts`.
  - *Evidence:* [`docs/migration/evidence/timezone_parity.txt`](evidence/timezone_parity.txt)

### 2. Contact Email Nodemailer & SMTP Delivery (Section 2)
- Replaced hand-written plain socket client in `apps/api/src/modules/contact/contact.service.ts` with `nodemailer`.
- Supported full Django configuration variables: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`, `ADMIN_EMAIL`. Defaults match Django (`smtp.gmail.com:587`, STARTTLS enabled).
- In `render-blueprint.yaml`, removed `localhost:1025` sink defaults and marked secrets as `sync: false`.
- Behavior matches Django: message is persisted to MongoDB `contact_message` first, endpoint always returns `{"status":"ok"}`, send failure is logged with context without crashing or throwing. Subject (`New Contact Message`), `Reply-To` header, and body text are 100% identical to Django's `landing/views.py:contact_view`.
- Added automated integration tests using `smtp-server` in `apps/api/test/contact_email.test.ts` testing STARTTLS + auth, wrong password resilience, server down resilience, and MIME format (4/4 passed).
- *Evidence:* [`docs/migration/evidence/contact_email_smtp.txt`](evidence/contact_email_smtp.txt)

### 3. Environment Variable Mapping & Production Boot Verification (Section 3)
- Created `docs/runbooks/env_mapping.md` with an exhaustive master table mapping every variable Django reads in `settings.py`, all app modules, and historical `render.yaml` to its Node counterpart, defaults in each stack, whether it must be set on Render, and alias support.
- Added backward-compatibility fallback mappings in `apps/api/src/config/env.ts` for:
  - `DJANGO_SECRET_KEY` $\to$ `JWT_SECRET`
  - `DJANGO_CORS_ALLOWED_ORIGINS` $\to$ `CORS_ORIGIN`
  - `AWS_STORAGE_BUCKET_NAME` $\to$ `S3_BUCKET_NAME`
  - `AWS_S3_REGION_NAME` $\to$ `AWS_REGION`
- In `apps/api/src/app.ts`, dynamically injected `FRONTEND_ORIGIN` into CORS allowlist matching Django's automatic behavior.
- In `apps/api/src/modules/bills/whatsapp.service.ts`, ported `WHATSAPP_API_VERSION` default `v21.0`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_BILL_TEMPLATE_LANGUAGE` (`en_US`), `WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR` (`false`), and implemented Django's placeholder detection rule.
- Verified in `scripts/test_render_production_boot.mjs`: booted Node in `NODE_ENV=production` with ONLY the environment variables the existing Django Render service currently defines (plus `METRICS_TOKEN`) against local MongoDB. Verified `/health`, Vercel CORS preflight, user login with JWT signing via `DJANGO_SECRET_KEY`, and metrics protection.
- *Evidence:* [`docs/runbooks/env_mapping.md`](../runbooks/env_mapping.md), [`docs/migration/evidence/render_production_boot.txt`](evidence/render_production_boot.txt)

### 4. Frontend Deployment Configuration (Vercel) (Section 4)
- Removed `insightloop-web` static service from `render-blueprint.yaml`.
- Updated `docs/runbooks/staging.md` detailing exact Vercel dashboard environment variables: `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`.
- Completely purged obsolete `VITE_API_URL` from the repository.
- Created `apps/web/test/env_urls.test.ts` and `scripts/check_web_env_vars.mjs` verifying all 37 source files under `apps/web/src` build URLs only from declared environment variables with 0 violations.

### 5. Final Configuration Adjustments (Boolean Parser Parity & WhatsApp Auto-Resolution)
- **Django `env_bool` Boolean Parser Parity**:
  - Replaced all `z.coerce.boolean()` instances (`EMAIL_USE_TLS`, `WHATSAPP_ENABLED`, `WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR`, `REHASH_PASSWORDS_ON_LOGIN`) in `apps/api/src/config/env.ts` with `parseEnvBool` and `envBoolSchema`.
  - Parser strictly replicates Django's `env_bool`: values matching `{"1", "true", "yes", "on"}` (case-insensitive, trimmed) evaluate to `true`, while everything else (including `"false"`, `"0"`, `"no"`, `""`) evaluates to `false`.
  - Replaced direct `process.env` workarounds in `contact.service.ts`, `whatsapp.service.ts`, and `storage.service.ts` to consume parsed `env` values directly.
  - Implemented dynamic `env` Proxy in test/dev modes delegating to validated configuration while providing high-performance cached access in production.
  - Added comprehensive tests in `apps/api/test/env_and_jwt_derivation.test.ts` covering `"false"`, `"0"`, `"no"`, `""`, `"TRUE"`, `"On"`, `"1"`, `"yes"`.
- **Render Blueprint & WhatsApp Provider Auto-Resolution**:
  - In `render-blueprint.yaml`, removed hardcoded `WHATSAPP_ENABLED` and `WHATSAPP_PROVIDER` values and marked them `sync: false`.
  - `apps/api/src/config/env.ts` automatically resolves `WHATSAPP_PROVIDER` (`'openwa'` vs `'meta'`) and `WHATSAPP_ENABLED` (`false` vs `true`) based on presence of real Meta credentials, matching Django's rule in `insightloop/settings.py`.
  - Added test cases in `apps/api/test/env_and_jwt_derivation.test.ts` verifying unset/placeholder credentials yield `'openwa'` and `false`, while valid Meta credentials yield `'meta'` and `true`.
  - Updated `docs/runbooks/env_mapping.md` with auto-resolution and boolean parsing guarantees.

---

## 4. Phase 5.10 Implementation & Parity Summary

### 1. Behavior Gaps Resolved (Section 1)
- **Root URL (`GET /`) Parity**:
  - Implemented `root_redirect` behavior in `apps/api/src/app.ts` matching Django `landing/urls.py`:
    - When `FRONTEND_ORIGIN` is configured, responds with a `302 Found` redirect to that origin.
    - When `FRONTEND_ORIGIN` is unset, responds with `200 OK` JSON: `{"status":"ok","service":"InsightLoop API"}` (never 500s).
  - Added `FRONTEND_ORIGIN` to `apps/api/src/config/env.ts`, `.env.example`, and `render-blueprint.yaml`.
  - Verified with 26 automated tests in `apps/api/test/root_and_metrics_auth.test.ts`.
- **Public Diagnostics Protection**:
  - Kept `/health`, `/api/v1/health/live`, and `/api/v1/health/ready` public (lightweight, zero internal diagnostics disclosed).
  - Protected detailed diagnostics and Prometheus metrics endpoints (`/health/detailed`, `/metrics`, `/api/v1/health/detailed`, `/api/v1/metrics`) with `requireMetricsAuth` middleware (`apps/api/src/middleware/metricsAuth.ts`).
  - Requires `METRICS_TOKEN` (via `x-metrics-token` header or `Authorization: Bearer <METRICS_TOKEN>`), returning `401 Unauthorized` without it.
  - Documented operational usage in `docs/runbooks/observability.md`.
- **Legacy Routes Audit**:
  - Audited all Django URL patterns across `urls.py` and `public_urls.py`. Django serves only `GET /` and `POST /contact` from `landing/urls.py`.
  - Removed invented non-existent routes (`/login`, `/dashboard`, etc.) from `apps/api/src/modules/legacy/legacy.routes.ts`. Clean `404 Not Found` returned without shadow route fabrication.
- **Media Route Matching**:
  - Confirmed `GET /media/*` is public with `Cache-Control: public`, strictly matching Django's `static(settings.MEDIA_URL)`.

### 2. Report Honesty & Parity Alignment (Section 2)
- **Worker Delete Cascade Wording Corrected**:
  - Corrected all prior incorrect "non-cascading" descriptions across documentation and scripts (`MIGRATION_REPORT.md`, `PROGRESS.md`, `scripts/test_worker_module_parity.mjs`, `evidence/B8_worker_module_parity.txt`).
  - Confirmed Django's `Worker.delete()` in `worker/models.py` deletes `MaterialAssignments` and `PayRecords` first (0 left in MongoDB), and Node's cascade matches Django exactly.
- **Invoice Template Citation Corrected**:
  - Fixed erroneous citation path to the canonical `insightloop/bills/templates/bills/invoice.html`.
  - Extended `scripts/check_citations.mjs` to validate 795 markdown citations and 154 code symbols with 0 errors.
- **PDF Parity, Badge & Test Images**:
  - Disclosed honestly: PDF diff files show whitespace and column-alignment differences only (all words and numbers are identical across all bills).
  - Added rounded pill badge rendering with padded background for "PAKKA" and "KACHA" status, matching Django's HTML badge styling.
  - Added test cases in `apps/api/test/pdf_parity.test.ts` for logo, signature, and stamp images served via local HTTP server, plus unreachable image fallback (5/5 passed).
- **Benchmark Sample Size & Fairness (56,000 Requests)**:
  - Re-ran load benchmark across 14 endpoints at C=10 and C=50 with exactly 1,000 requests per cell (56,000 requests total, zero cache, identical indexes).
  - Eliminated the `p95 = p99` low-sample anomaly; results recorded in `docs/migration/evidence/C3_load_benchmark.txt`. Peak RSS measured at 212.6 MB for Node vs 121.8 MB for Django.
- **Financial & Calculation Mutation Testing**:
  - Ran Stryker mutation tests focused specifically on financial calculation functions (totals, GST, discounts, payments, balances, profit, stock deltas, wage amounts, `roundPy`):
    - `packages/shared/src/math.ts`: **94.61% raw** (158 killed, 9 non-money survivors).
    - `apps/api/src/modules/bills/bills.service.ts:233-284`: **79.03% raw** (48 killed, 1 timeout, 13 survivors: error strings & fallback units).
    - `apps/api/src/modules/workers/workers.service.ts:475-555`: **57.26% raw** (71 killed, 53 survivors: error strings & null guards).
  - 100% of money, number, stock count, and calculation mutants were killed; line-by-line survivor breakdown recorded in `docs/migration/evidence/C2_coverage_mutation.txt`.
- Extracted and cataloged every element from Django WeasyPrint template (`insightloop/bills/templates/bills/invoice.html` with inline CSS).
- Built PDFKit rendering in `apps/api/src/modules/bills/pdf.service.ts` matching layout, rupee symbol (`₹`), 2-decimal currency formatting, thousands separators, table columns, GST breakup, payment table, balance, notes, terms, footer, and multi-page layout.
- Tested across 4 golden bills against real Django WeasyPrint PDFs with `pdftotext -layout` and PNG page renders:
  - Bill 1: Pakka Standard (with logo, signature, GST, bank details)
  - Bill 2: Kacha (no logo, no GST)
  - Bill 3: Pakka Multipage (28 items forcing page break)
  - Bill 4: Kacha Multipage (25 items forcing page break)
- **Result: Saved diff files show whitespace and column-alignment differences only (all words and numbers are identical across all 4 bills)**.
- Added automated offline regression test `apps/api/test/pdf_parity.test.ts`.
- WhatsApp service verified against `whatsapp.py` and `whatsapp_openwa.py` with mock server tests in `apps/api/test/whatsapp_mock.test.ts`.
- *Evidence:* [`docs/migration/evidence/pdf_parity/`](docs/migration/evidence/pdf_parity/), [`apps/api/test/pdf_parity.test.ts`](apps/api/test/pdf_parity.test.ts)

### 3. Expanded True Dual-Stack Parity Run (Section 3)
- Expanded dual-stack parity suite covering **71/71 passing checks** across 11 areas:
  - `PUT /bills/:id/`: edit bill (products, quantities, GST, discount; stock decrements and restores accurately).
  - Create pakka bill, insufficient stock 400 rejection text, deleted inventory item resilience, delete bill stock restoration, kacha $\to$ pakka invoice number conversion.
  - Auth matrix: signup, login (valid, invalid password, unknown email, uppercase email, whitespace email), refresh token rotation, Google login against mock tokeninfo server (wrong audience, unverified email, success).
  - CSV Uploads: valid CSV, empty file (400 missing columns list), header-only (200 with 0 created), BOM encoding, CRLF newlines, invalid number, negative numbers, oversize rejection; live dashboard numbers verified; CSV export download names and content verified.
  - Insights: generate, list, detail, export. Profile: PUT updates. AI Assistant: command routing for export, navigate, revenue, profit, worker performance, unknown intents.
  - Contact: CSRF/auth resolution, submission validation, message persistence, and SMTP notification to local SMTP sink verified on both stacks.
  - Worker Delete Cascade Audit: verified in MongoDB queries that deleting a worker via the API cleanly cascades to delete `material_assignments` and `pay_records` on both stacks (0 remaining documents matching Django `Worker.delete()`); additionally verified that if an orphaned reference exists directly in MongoDB, dashboard top-workers gracefully labels it as `"Deleted Worker"`.
  - WebSocket: real frame capture and assertion matching Django Daphne for dashboard updates and AI replies, plus close code `4001` for missing/expired tokens.
- **Totals by Method**: GET: 20 | PUT: 5 | POST: 39 | DELETE: 3 | DB_QUERY: 1 | WS: 3
- **Totals by Area**: profile: 4, inventory: 13, bills: 12, workers: 7, dashboard: 3, auth: 11, upload: 6, insights: 3, ai: 6, contact: 3, websocket: 3.
- *Evidence:* [`docs/migration/evidence/parity_django_vs_node.txt`](docs/migration/evidence/parity_django_vs_node.txt)

### 4. Feature & Asset Parity Ledger Honesty (Section 4)
- Cataloged all non-Python Django assets: HTML templates, static files, requirements packages, Dockerfiles, Procfile, Render configs, environment variables, and management commands (`backfill_inventory_from_production` confirmed one-off).
- Total Cataloged Assets: **176 items**.
  - **MISSING: None**
  - **UNVERIFIED: None**
- Every `PORTED` row cites an exact, verified test file and test name (`test_file#test_name`).
- Verified by automated validator `scripts/check_feature_ledger.mjs` with **0 errors**.
- Legacy server-rendered routes are monitored with `x-legacy-shadow-route` diagnostic headers, logged at `warn` level with `{ route, method, userAgent }`, and verified in `apps/api/test/legacy_routes.test.ts`.
- *Evidence:* [`docs/migration/python-feature-ledger.md`](docs/migration/python-feature-ledger.md), [`scripts/check_feature_ledger.mjs`](scripts/check_feature_ledger.mjs)

### 5. Python-Free Gate Verification on `chore/remove-python` (Section 5)
- Branch `chore/remove-python` verified in isolation without Python installed:
  - Total `.py` files: **0**
  - Total `requirements*.txt` files: **0**
  - Total `.venv` directories: **0**
  - Total Django Dockerfiles / Procfiles: **0**
  - Total Python CI steps: **0**
  - `pnpm install`: PASS
  - `pnpm build`: PASS
  - `pnpm lint`: PASS (0 errors)
  - `pnpm typecheck`: PASS (0 errors)
  - API Tests: **60/60 test files, 304/304 passed**
  - Web Tests: **25/25 test files, 107/107 passed**
  - Branch Coverage Gate: **PASS**
  - Architecture Wiring & Silent Error Gates: **PASS (0 violations)**
  - Document Shape Gate: **PASS (10/10 collections conform to frozen schema)**
  - Negative Fixtures Suite: **PASS**
  - Frozen Snapshots Parity Suite: **PASS (62/62 static fixtures match Node API with 0 diff)**
  - Playwright E2E Suite: **11/11 tests passed in 17.0s**
  - Docker Multi-Stage Builds:
    - `insightloop-api:gate`: SUCCESS
    - `insightloop-web:gate`: SUCCESS
  - Complete keyword grep audit (`django|python|mongoengine|daphne|gunicorn|weasyprint`): 130 files categorized with reasons in `python_free_gate.txt`.
- **Merge Mandate Strictly Observed**: `chore/remove-python` is **NOT** merged into `migration/mern`. `migration/mern` maintains Django for the required 14-day canary rollback window as documented in `docs/runbooks/python_removal_merge.md`.
- *Evidence:* [`docs/migration/evidence/python_free_gate.txt`](docs/migration/evidence/python_free_gate.txt), [`docs/runbooks/python_removal_merge.md`](../runbooks/python_removal_merge.md)

---

## 5. Benchmark Comparison Table (Identical Indexes, Zero Cache)

| Concurrency | Endpoint                 | Stack  | Requests | p50 (ms) | p95 (ms) | p99 (ms) | Errors | Peak RSS (MB) | Faster?    |
| :---------- | :----------------------- | :----- | :------- | :------- | :------- | :------- | :----- | :------------ | :--------- |
| C=10        | Dashboard Summary        | Node   |     1000 |      7.1 |     19.9 |     27.6 |      0 |         212.6 | Node (WIN) |
| C=10        | Dashboard Summary        | Django |     1000 |     96.2 |    160.3 |    224.6 |      0 |         121.8 |            |
| C=10        | Dashboard Overview       | Node   |     1000 |     17.1 |     45.3 |     91.2 |      0 |         212.6 | Node (WIN) |
| C=10        | Dashboard Overview       | Django |     1000 |      525 |    675.9 |    789.4 |      0 |         121.8 |            |
| C=10        | Dashboard Rev & Exp      | Node   |     1000 |      4.7 |       14 |       31 |      0 |         212.6 | Node (WIN) |
| C=10        | Dashboard Rev & Exp      | Django |     1000 |     21.8 |     30.7 |     79.4 |      0 |         121.8 |            |
| C=10        | Dashboard Profit Trends  | Node   |     1000 |      3.5 |     15.8 |       27 |      0 |         212.6 | Node (WIN) |
| C=10        | Dashboard Profit Trends  | Django |     1000 |     21.7 |     33.6 |     51.4 |      0 |         121.8 |            |
| C=10        | Dashboard Workers        | Node   |     1000 |      2.4 |      7.3 |     14.7 |      0 |         212.6 | Node (WIN) |
| C=10        | Dashboard Workers        | Django |     1000 |    291.6 |    435.7 |    518.5 |      0 |         121.8 |            |
| C=10        | Dashboard Top Workers    | Node   |     1000 |        2 |     11.2 |     26.8 |      0 |         212.6 | Node (WIN) |
| C=10        | Dashboard Top Workers    | Django |     1000 |     89.9 |    128.4 |    165.1 |      0 |         121.8 |            |
| C=10        | Insights List            | Node   |     1000 |        2 |      9.2 |     22.9 |      0 |         212.6 | Node (WIN) |
| C=10        | Insights List            | Django |     1000 |     21.2 |     38.7 |     92.9 |      0 |         121.8 |            |
| C=10        | Bills List (Pakka)       | Node   |     1000 |      3.3 |     20.3 |     56.3 |      0 |         212.6 | Node (WIN) |
| C=10        | Bills List (Pakka)       | Django |     1000 |     33.2 |     55.1 |     88.7 |      0 |         121.8 |            |
| C=10        | Bills List (Kacha)       | Node   |     1000 |      2.4 |      9.4 |     32.3 |      0 |         212.6 | Node (WIN) |
| C=10        | Bills List (Kacha)       | Django |     1000 |     23.3 |       36 |     84.2 |      0 |         121.8 |            |
| C=10        | Finished Inventory       | Node   |     1000 |      3.1 |      8.9 |     21.3 |      0 |         212.6 | Node (WIN) |
| C=10        | Finished Inventory       | Django |     1000 |     22.7 |     36.6 |     68.8 |      0 |         121.8 |            |
| C=10        | Semi-Finished Inventory  | Node   |     1000 |      2.3 |      8.5 |       19 |      0 |         212.6 | Node (WIN) |
| C=10        | Semi-Finished Inventory  | Django |     1000 |     22.7 |     34.5 |     56.9 |      0 |         121.8 |            |
| C=10        | Raw Inventory            | Node   |     1000 |      2.2 |      5.8 |     27.1 |      0 |         212.6 | Node (WIN) |
| C=10        | Raw Inventory            | Django |     1000 |     23.4 |     36.4 |    109.6 |      0 |         121.8 |            |
| C=10        | Warehouses List          | Node   |     1000 |      1.9 |      8.1 |    155.2 |      0 |         212.6 | Node (WIN) |
| C=10        | Warehouses List          | Django |     1000 |     22.6 |     66.2 |    127.3 |      0 |         121.8 |            |
| C=10        | Workers List             | Node   |     1000 |      3.5 |     10.9 |     80.8 |      0 |         212.6 | Node (WIN) |
| C=10        | Workers List             | Django |     1000 |       27 |     48.7 |    158.8 |      0 |         121.8 |            |
| C=50        | Dashboard Summary        | Node   |     1000 |     28.9 |     66.9 |    117.7 |      0 |         212.6 | Node (WIN) |
| C=50        | Dashboard Summary        | Django |     1000 |    492.2 |    721.2 |    809.9 |      0 |         121.8 |            |
| C=50        | Dashboard Overview       | Node   |     1000 |    114.3 |    152.6 |    179.8 |      0 |         212.6 | Node (WIN) |
| C=50        | Dashboard Overview       | Django |     1000 |   2886.6 |   3473.2 |     3702 |      0 |         121.8 |            |
| C=50        | Dashboard Rev & Exp      | Node   |     1000 |     24.6 |     67.4 |     86.9 |      0 |         212.6 | Node (WIN) |
| C=50        | Dashboard Rev & Exp      | Django |     1000 |    100.5 |    161.5 |    181.3 |      0 |         121.8 |            |
| C=50        | Dashboard Profit Trends  | Node   |     1000 |     23.4 |     54.7 |     89.7 |      0 |         212.6 | Node (WIN) |
| C=50        | Dashboard Profit Trends  | Django |     1000 |    109.2 |    293.8 |    444.3 |      0 |         121.8 |            |
| C=50        | Dashboard Workers        | Node   |     1000 |     16.3 |    116.6 |    234.2 |      0 |         212.6 | Node (WIN) |
| C=50        | Dashboard Workers        | Django |     1000 |   1648.1 |     2014 |   2336.1 |      0 |         121.8 |            |
| C=50        | Dashboard Top Workers    | Node   |     1000 |     10.8 |     54.8 |     63.9 |      0 |         212.6 | Node (WIN) |
| C=50        | Dashboard Top Workers    | Django |     1000 |    487.7 |      587 |    651.9 |      0 |         121.8 |            |
| C=50        | Insights List            | Node   |     1000 |     12.3 |     38.8 |     43.3 |      0 |         212.6 | Node (WIN) |
| C=50        | Insights List            | Django |     1000 |     96.1 |    156.3 |      199 |      0 |         121.8 |            |
| C=50        | Bills List (Pakka)       | Node   |     1000 |     15.1 |     39.1 |     44.1 |      0 |         212.6 | Node (WIN) |
| C=50        | Bills List (Pakka)       | Django |     1000 |    147.2 |    244.6 |    293.6 |      0 |         121.8 |            |
| C=50        | Bills List (Kacha)       | Node   |     1000 |     11.3 |     38.6 |     42.6 |      0 |         212.6 | Node (WIN) |
| C=50        | Bills List (Kacha)       | Django |     1000 |    108.9 |    175.7 |    226.7 |      0 |         121.8 |            |
| C=50        | Finished Inventory       | Node   |     1000 |     12.8 |     36.7 |     43.7 |      0 |         212.6 | Node (WIN) |
| C=50        | Finished Inventory       | Django |     1000 |     98.8 |    158.4 |    215.1 |      0 |         121.8 |            |
| C=50        | Semi-Finished Inventory  | Node   |     1000 |     12.8 |     34.5 |     41.7 |      0 |         212.6 | Node (WIN) |
| C=50        | Semi-Finished Inventory  | Django |     1000 |    105.1 |    167.9 |    208.7 |      0 |         121.8 |            |
| C=50        | Raw Inventory            | Node   |     1000 |     12.8 |     33.9 |     41.4 |      0 |         212.6 | Node (WIN) |
| C=50        | Raw Inventory            | Django |     1000 |    103.5 |    163.6 |    206.8 |      0 |         121.8 |            |
| C=50        | Warehouses List          | Node   |     1000 |     11.6 |     33.9 |     42.1 |      0 |         212.6 | Node (WIN) |
| C=50        | Warehouses List          | Django |     1000 |     98.7 |    157.9 |    202.4 |      0 |         121.8 |            |
| C=50        | Workers List             | Node   |     1000 |     14.5 |     47.1 |     53.3 |      0 |         212.6 | Node (WIN) |
| C=50        | Workers List             | Django |     1000 |    119.5 |    194.5 |    244.3 |      0 |         121.8 |            |

---

## 6. Known Gaps & Operational Items

The codebase on `main` is deploy-ready and verified. The following operational items require dashboard credential injection during staging/production cutover:

| Gap / Operational Item | Current State | Target Phase | Deferred Rationale |
|---|---|---|---|
| **Phase 6 Deployment** | Deploy prep & smoke test complete; ready for user cutover | Phase 6 | User applies Render Blueprint and Vercel project with production secrets. |
| **Canary Soak Period** | Django preserved in `insightloop/` on `main` | Phase 6/7 | Required 14-day dual-stack canary window before final decommissioning. |
| **`chore/remove-python` Merge** | Kept separate and unmerged | Phase 7.5 | Strictly forbidden to merge until 14 days of flawless canary operation have completed without rollbacks. |
| **Legacy HTML Traffic Monitoring** | Diagnostic shadow headers logging at `warn` level | Phase 7 | Monitor real user traffic on legacy routes for 30 days before deleting deprecated views. |
| **WhatsApp Cloud API Credentials** | Fallback to OpenWA or placeholder detection active | Production Cutover | Production Meta System User Access Token and Phone Number ID to be set in Render dashboard when live. |
| **SMTP Delivery Credentials** | Nodemailer STARTTLS verified; graceful failure logged | Production Cutover | Production Gmail App Password or SendGrid credentials to be set in Render dashboard. |
| **S3 Storage Configuration** | Defaults to MongoDB GridFS binary storage | Production Cutover | Set `STORAGE_DRIVER=s3` and AWS credentials if S3 bucket archiving is desired. |
| **Google Client ID** | Public client ID verified in GIS button and API | Production Cutover | Configured on both Vercel (`VITE_GOOGLE_CLIENT_ID`) and Render (`GOOGLE_CLIENT_ID`). |

---

## 7. Byte-Safety Baseline Verification
- Baseline tag: `pre-mern-migration-2026-10-15`
- `git diff pre-mern-migration-2026-10-15..HEAD -- insightloop/`: **0 bytes (Exact match, zero alterations on main)**

---

## 8. Phase 7: Live Latency Diagnostic, Root Cause Analysis, Performance Fixes & Python Removal Gate

### 1. Live Benchmark Measurements (`docs/migration/evidence/perf_live.txt`)
- **Target**: `https://insightloop.onrender.com` (Render Free tier: 0.1 CPU, 512 MB RAM, Oregon).
- **Cold Start (20m 24s idle)**: Initial request to `GET /health` took **52,185.98 ms** (52.2s spin-up time).
- **Warm Latency (10 runs per endpoint, min / median / max in ms)**:
  - `GET /health`: 255.95 ms / 292.51 ms / 531.45 ms
  - `POST /api/v1/auth/signup`: 1,534.71 ms / 1,676.71 ms / 2,031.45 ms
  - `POST /api/v1/auth/login`: 1,493.48 ms / 1,590.52 ms / 1,742.76 ms
  - `GET /api/v1/dashboard/overview`: 721.11 ms / 1,970.65 ms / 3,896.79 ms
  - `GET /api/v1/bills`: 711.41 ms / 757.03 ms / 1,660.47 ms
  - `GET /api/v1/workers`: 705.93 ms / 727.40 ms / 826.48 ms
  - `GET /api/v1/inventory/finished`: 727.51 ms / 792.84 ms / 1,084.17 ms
  - `GET /api/v1/insights`: 483.97 ms / 506.79 ms / 612.83 ms
  - `GET /api/v1/bills/:id/pdf`: 1,105.85 ms / 1,256.31 ms / 1,948.66 ms
- **PBKDF2 Password Hashing**:
  - Hash format: Django PBKDF2 SHA-256 (`pbkdf2_sha256$600000$<salt>$<hash>`).
  - Iteration count: 600,000 iterations.
  - Cost: On a 0.1 CPU core Render instance, PBKDF2 takes ~1,590 ms of synchronous CPU time per login/signup attempt, blocking the Node event loop.
- **Atlas Cluster RTT**:
  - Baseline health ping round trip from client: ~292 ms.
  - Single-query endpoint latency: ~506 ms (Oregon to Atlas query round trip is ~100-200 ms if Atlas is outside Oregon).

### 2. Root Cause Analysis in Code
1. **N+1 / Sequential Queries**:
   - `apps/api/src/modules/dashboard/dashboard.service.ts`: `getBillMonthlySeries` was executed twice sequentially for the same 6-month period during `getDashboardData`.
   - `apps/api/src/modules/dashboard/dashboard.service.ts`: `generateExportFile('worker_management')` executed $2N$ queries looping over workers, and repository queried incorrect collection name (`assignments` vs `material_assignments`).
2. **Missing / Misaligned Indexes (`apps/api/src/db/mongo.ts`)**:
   - `bills`: index was `{ company_id: 1, type: 1, date: -1 }` (wrong field name `type` instead of `bill_type`, and sort `date` instead of `created_at`).
   - `inventory_items`: missing compound sort index for pagination: `{ company_id: 1, type: 1, updated_at: -1, _id: -1 }`.
   - `warehouses`: completely unindexed. Added `{ company_id: 1, name: 1 }`.
   - `workers`: missing `{ company_id: 1, created_at: -1 }`.
   - `insights`: zero indexes existed. Added `{ company_id: 1, created_at: -1 }`.
   - `pay_records`: added `{ company_id: 1, date: -1 }`.
3. **Repeated Per-Request Overhead**:
   - `apps/api/src/modules/bills/pdf.service.ts`: Font resolution executed `fs.existsSync` 12 times per PDF and searched legacy macOS Python paths. Cached in-memory font path resolution and removed Python paths.
   - Production environment caching verified: `env.ts` caches validated config when `NODE_ENV=production`, avoiding Zod parsing on property access.
4. **Dashboard WebSocket Overhead**:
   - `apps/api/src/ws/gateway.ts`: Every new WebSocket connection executed the full 6-job dashboard aggregation suite immediately upon connection.
5. **Missing HTTP Compression**:
   - Responses served uncompressed JSON. Added `compression` middleware, reducing payload transfer sizes by 70-85%.
6. **Frontend Web Load Request Volume**:
   - Dashboard page fired 6 parallel HTTP requests (`summary`, `rev-exp`, `profit-trends`, `workers`, `top-workers`, `bills`) plus 1 WebSocket connection.
   - Bill list page fired 4 HTTP requests (3 warehouse summary endpoints + bills list).
7. **Cold Start Enforced by Infrastructure**:
   - Render Free plan spins down instances after 15 minutes of inactivity. Cold start recovery takes ~52s.

### 3. Performance Fixes Committed to `perf/live-latency`
- `8715d61` `perf(api): add request timing middleware and startup mongo latency measurement`
- `4fd1bf3` `perf(api): add additive indexes, font cache, and eliminate N+1 queries`
- `20fbc92` `perf(api): add gzip compression middleware with response body parity verification`
- `e41c1d0` `perf(evidence): record live benchmark evidence and measurement scripts`
- Local before/after benchmarks:
  - Local Bills list: 4.88 ms -> 2.18 ms (-55.3%)
  - Local Dashboard overview: 14.52 ms -> 6.81 ms (-53.1%)
  - Local Bill PDF generation: 41.52 ms -> 22.31 ms (-46.3%)
  - Uncompressed JSON payload: 2,492 bytes -> Gzipped: 412 bytes (-83.5%)

### 4. Section 4: Python Removal Preparation (`chore/remove-python`)
- **Branch Synchronization**: `chore/remove-python` recreated from `main` + `perf/live-latency` fixes.
- **Python Assets Purged**:
  - Deleted entire `insightloop/` Django codebase (140+ files, templates, migrations).
  - Deleted `requirements.txt` and `requirements-lock.txt`.
  - Deleted Python scripts in `scripts/` (`seed_test_db.py`, `export_django_model_schema.py`, etc.).
  - Purged Python setup and run steps from `.github/workflows/ci.yml`.
  - Confirmed 0 `.py` files, 0 `requirements*.txt`, 0 Django Dockerfiles/Procfiles, and 0 `setup-python` CI steps.
- **Clean Clone Verification Gate (Python Disabled)**:
  - Cloned clean repo into `/tmp/insightloop-clean-gate` with Python executable stubs returning exit code 127.
  - `pnpm install --frozen-lockfile`: PASS (4.2s)
  - `pnpm build`: PASS (5.7s)
  - `pnpm typecheck`: PASS (0 errors, 2.7s)
  - `pnpm lint`: PASS (0 errors)
  - Backend API tests: PASS (64/64 files, 356/356 tests passed, 100%)
  - Frontend Web tests: PASS (26/26 files, 111/111 tests passed, 100%)
  - Production Boot Smoke Test (`scripts/smoke_test.mjs` against local production boot): PASS (16/16 steps, 0 errors)
  - Docker Container Builds:
    - API: `insightloop-api:python-free-gate` (PASS, exit code 0)
    - Web: `insightloop-web:python-free-gate` (PASS, exit code 0)
- **Documentation & Operational Runbooks**:
  - Created `docs/runbooks/how_it_runs_now.md` documenting Render API, Vercel frontend, Atlas database, environment variables, and rollback procedures.
  - Verified baseline tag `pre-mern-migration-2026-10-15` (`9410c2a33f6fef2ceed8a07843cfb52f7a04be71`) exists and documented exact commands to restore Django code.
  - Categorized audit of all remaining keyword references recorded in `docs/migration/evidence/python_free_gate.txt`.
- **Status**: STOPPED without pushing to remote or merging branches. Ready for user pull request and GitHub merge.

