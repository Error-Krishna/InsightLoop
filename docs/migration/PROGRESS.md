# InsightLoop Migration Progress

## 1. Status Header
- **Current Phase**: Phase 5.11 (Production Config Parity: UTC Timezone Baseline & Midnight/Month-End Boundaries, Nodemailer STARTTLS & Graceful SMTP Delivery, Environment Variable Mapping & Production Render Boot Verification, Vercel Frontend Config & Web URL Safety)
- **Status**: PHASE 5.11 COMPLETE (STAGING-CANDIDATE)
- **Phase Locks**: Phases 6, 7, 8 Strictly Locked (Never Initiated; no remote push, no staging/production deploy)
- **Removal Branch Mandate**: `chore/remove-python` remains separate and UNMERGED. `migration/mern` retains Django for 14-day canary rollback window.
- **Last Updated**: 2026-10-17 08:35 UTC
- **Next Action**: Staging deployment dry-run and click-through review on staging candidate branch `migration/mern`.

---

## 2. Phase 5.11 Implementation & Production Config Parity Summary

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

## 3. Phase 5.10 Implementation & Parity Summary

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

## 4. Benchmark Comparison Table (Identical Indexes, Zero Cache)

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

## 5. Known Gaps & Operational Items

The codebase on `migration/mern` represents a production-ready **STAGING-CANDIDATE**. The following items remain deferred or require dashboard credential injection during staging/production cutover:

| Gap / Operational Item | Current State | Target Phase | Deferred Rationale |
|---|---|---|---|
| **Phase 6 Deployment** | Staging and Production deployment blocked | Phase 6 | Strictly locked by autonomous rules pending user authorization. |
| **Canary Soak Period** | Django preserved in `insightloop/` on `migration/mern` | Phase 6/7 | Required 14-day dual-stack canary window before final decommissioning. |
| **`chore/remove-python` Merge** | Kept separate and unmerged | Phase 7.5 | Strictly forbidden to merge until 14 days of flawless canary operation have completed without rollbacks. |
| **Legacy HTML Traffic Monitoring** | Diagnostic shadow headers logging at `warn` level | Phase 7 | Monitor real user traffic on legacy routes for 30 days before deleting deprecated views. |
| **WhatsApp Cloud API Credentials** | Fallback to OpenWA or placeholder detection active | Production Cutover | Production Meta System User Access Token and Phone Number ID to be set in Render dashboard when live. |
| **SMTP Delivery Credentials** | Nodemailer STARTTLS verified; graceful failure logged | Production Cutover | Production Gmail App Password or SendGrid credentials to be set in Render dashboard. |
| **S3 Storage Configuration** | Defaults to MongoDB GridFS binary storage | Production Cutover | Set `STORAGE_DRIVER=s3` and AWS credentials if S3 bucket archiving is desired. |
| **Google Client ID** | Public client ID verified in GIS button and API | Production Cutover | Configured on both Vercel (`VITE_GOOGLE_CLIENT_ID`) and Render (`GOOGLE_CLIENT_ID`). |

---

## 6. Byte-Safety Baseline Verification
- Baseline tag: `pre-mern-migration-2026-10-15`
- `git diff pre-mern-migration-2026-10-15..HEAD -- insightloop/`: **0 bytes (Exact match, zero alterations)**
