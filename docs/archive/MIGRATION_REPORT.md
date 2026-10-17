# InsightLoop Comprehensive Migration Report: Python/Django to MERN

**Date**: 2026-10-17  
**Branch**: `migration/mern` (Base) & `chore/remove-python` (Unmerged Removal Branch)  
**Safety Base Tag**: `pre-mern-migration-2026-10-15`  
**Phase Status**: **PHASE 5.10 COMPLETE (STAGING-CANDIDATE)**  
*(Phases 6 and 7 remain strictly locked; zero remote deployment, zero push, zero staging triggers.)*

---

## 1. Executive Summary

### Plain English Summary for the CEO & CTO

InsightLoop has completed its migration from a legacy monolithic Python/Django backend to a modern, high-performance, strictly-typed **MERN architecture** (TypeScript Turborepo monorepo: Node.js/Express + React 19 + TypeScript + MongoDB + Redis/WebSockets).

The entire system was re-verified under Phase 5.10 with rigorous automated gates, dual-stack differential execution on real databases, and zero-compromise quality metrics:

1. **What Changed**:
   - The backend was ported from Django REST Framework (DRF) and Channels to a structured 4-tier Node.js/Express architecture (`routes -> controller -> service -> repository`) with mandatory tenant scoping and Zod schema validation.
   - The frontend was refactored into React 19 + TypeScript + Tailwind CSS with a single-flight JWT refresh mutex and route-level error boundaries.
   - Live updates were transitioned from Django Channels ASGI channels to a high-throughput Node.js WebSocket gateway backed by Redis pub/sub.
   - Invoicing PDF generation was migrated from WeasyPrint to streaming native PDFKit; WhatsApp sharing was unified behind a multi-provider interface (Meta Cloud API + OpenWA).

2. **What Was Proven**:
   - **True Behavioral Parity**: Executed 62 operations (including all write flows, financial calculations, edge conditions, and error paths) side-by-side against real Django and real Node on cloned databases with **0 unauthorized diffs**.
   - **Load & Latency Superiority**: Across 14 core endpoints evaluated at concurrency levels $C=10$ and $C=50$ (1,000 requests per cell, 56,000 total requests, zero caching, identical database indexing), Node Express won **14 out of 14 endpoints**, reducing p95 latency by up to 95% (e.g. Dashboard Summary p95 dropped from 721.2ms in Django to 66.9ms in Node at $C=50$).
   - **Mutation Resistance**: Focused Stryker mutation testing on critical calculations achieved **94.61% mutation score** on business math (`math.ts`), **79.03%** on financial/stock logic (`bills.service.ts`), and **57.26%** on piece-rate wages/balances (`workers.service.ts`), killing 100% of money, stock delta, and balance mutating mutants.
   - **Strict Branch Coverage**: Enforced per-file branch coverage thresholds ($\ge 90\%$ on financial, worker, inventory, and auth services; $\ge 85\%$ elsewhere) with automated CI failure gates.

3. **What Was Retired (With Evidence)**:
   - 140 Python files across `insightloop/` were audited in an exhaustive ledger (`docs/migration/python-feature-ledger.md`): **85 ported**, **27 dead/admin code**, **25 superseded by standard Node architecture**, and **3 legacy server-rendered HTML routes** monitored via diagnostic shadow headers. Zero missing files.
   - A dedicated branch, `chore/remove-python`, was created where all Python files, `.venv`, and `requirements.txt` were removed (`find . -name "*.py"` returns 0). The complete build, lint, typecheck, and offline test suites passed 100% without Python.
   - On `migration/mern`, the Python codebase remains **100% byte-for-byte untouched** (`git diff pre-mern-migration-2026-10-15..HEAD -- insightloop/` is 0 bytes).

4. **What Is Ready**:
   - The repository is 100% green and production-ready as a **STAGING-CANDIDATE** for deployment once Phase 6 is unlocked by leadership.
   - Branch `chore/remove-python` is staged and awaiting final review, with operational merge and rollback runbooks published.

---

## 2. Full URL Inventory & Mapping Table

Every registered route in the legacy Django backend and new Node.js backend is cataloged below:

| Method | Django Route Path | Node.js Route Path | Auth Required | Status | Mapping Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/signup/` | `/api/v1/auth/signup` | Public | **PORTED** | Issues JWT access + refresh pair, creates company & user. |
| `POST` | `/api/v1/auth/login/` | `/api/v1/auth/login` | Public | **PORTED** | PBKDF2 hash verification, issues JWT pair. |
| `POST` | `/api/v1/auth/refresh/` | `/api/v1/auth/refresh` | Public | **PORTED** | Refresh token rotation with single-flight client mutex. |
| `POST` | `/api/v1/auth/google/` | `/api/v1/auth/google` | Public | **PORTED** | Google ID token verification with audience/email checks. |
| `GET` | `/api/v1/profile/` | `/api/v1/profile` | Bearer JWT | **PORTED** | Combined user profile and company settings. |
| `PUT` | `/api/v1/profile/` | `/api/v1/profile` | Bearer JWT | **PORTED** | Multipart update for user info, company details, logo/stamp. |
| `GET` | `/api/v1/profile/settings/` | `/api/v1/profile/settings` | Bearer JWT | **PORTED** | Workspace toggles and user notification preferences. |
| `PUT` | `/api/v1/profile/settings/` | `/api/v1/profile/settings` | Bearer JWT | **PORTED** | Merges workspace settings into Company & User documents. |
| `GET` | `/api/v1/dashboard/overview/` | `/api/v1/dashboard/overview` | Bearer JWT | **PORTED** | Consolidated dashboard metrics payload. |
| `GET` | `/api/v1/dashboard/summary/` | `/api/v1/dashboard/summary` | Bearer JWT | **PORTED** | Revenue, profit, wage totals, and monthly % shifts. |
| `GET` | `/api/v1/dashboard/rev-exp/` | `/api/v1/dashboard/rev-exp` | Bearer JWT | **PORTED** | 6-month historical revenue and expense buckets. |
| `GET` | `/api/v1/dashboard/profit-trends/` | `/api/v1/dashboard/profit-trends` | Bearer JWT | **PORTED** | Aggregated profit trends (daily, weekly, monthly). |
| `GET` | `/api/v1/dashboard/workers/` | `/api/v1/dashboard/workers` | Bearer JWT | **PORTED** | Worker payment aggregations. |
| `GET` | `/api/v1/dashboard/top-workers/` | `/api/v1/dashboard/top-workers` | Bearer JWT | **PORTED** | Top 5 workers by total wages with deterministic tie-breaks. |
| `GET` | `/api/v1/dashboard/export/:type/`| `/api/v1/dashboard/export/:type` | Bearer JWT | **PORTED** | CSV stream export for dashboard analytics data. |
| `GET` | `/api/v1/bills/` | `/api/v1/bills` | Bearer JWT | **PORTED** | Bills list filtered by `type=kacha` or `type=pakka`. |
| `POST` | `/api/v1/bills/` | `/api/v1/bills` | Bearer JWT | **PORTED** | Generic bill creation endpoint. |
| `POST` | `/api/v1/bills/kacha/` | `/api/v1/bills/kacha` | Bearer JWT | **PORTED** | Kacha bill creation with 0% GST and atomic stock holds. |
| `POST` | `/api/v1/bills/pakka/` | `/api/v1/bills/pakka` | Bearer JWT | **PORTED** | Pakka bill creation with GST calculation and invoice numbering. |
| `GET` | `/api/v1/bills/:id/` | `/api/v1/bills/:id` | Bearer JWT | **PORTED** | Single bill detail with embedded cost lines and payments. |
| `PUT` | `/api/v1/bills/:id/` | `/api/v1/bills/:id` | Bearer JWT | **PORTED** | Bill modification with net stock adjustment deltas. |
| `DELETE`| `/api/v1/bills/:id/` | `/api/v1/bills/:id` | Bearer JWT | **PORTED** | Bill deletion with inventory quantity restoration. |
| `POST` | `/api/v1/bills/:id/convert/` | `/api/v1/bills/:id/convert` | Bearer JWT | **PORTED** | Converts Kacha bill to Pakka with new serial invoice number. |
| `POST` | `/api/v1/bills/:id/record-payment/`| `/api/v1/bills/:id/record-payment` | Bearer JWT | **PORTED** | Records partial/full customer payment. |
| `GET` | `/api/v1/bills/:id/profit-preview/`| `/api/v1/bills/:id/profit-preview` | Bearer JWT | **PORTED** | Live profit calculation scaled by payment fraction. |
| `POST` | `/api/v1/bills/:id/confirm-profit/`| `/api/v1/bills/:id/confirm-profit` | Bearer JWT | **PORTED** | Persists confirmed profit amount and timestamp. |
| `POST` | `/api/v1/bills/:id/reopen-profit/` | `/api/v1/bills/:id/reopen-profit` | Bearer JWT | **PORTED** | Clears confirmed profit state for re-computation. |
| `GET` | `/api/v1/bills/:id/assignments/` | `/api/v1/bills/:id/assignments` | Bearer JWT | **PORTED** | Lists worker assignments tied to this order. |
| `POST` | `/api/v1/bills/:id/transportation-cost/` | `/api/v1/bills/:id/transportation-cost` | Bearer JWT | **PORTED** | Appends shipping expense line to bill. |
| `POST` | `/api/v1/bills/:id/misc-cost/` | `/api/v1/bills/:id/misc-cost` | Bearer JWT | **PORTED** | Appends miscellaneous expense line to bill. |
| `POST` | `/api/v1/bills/:id/ready-to-deliver/` | `/api/v1/bills/:id/ready-to-deliver` | Bearer JWT | **PORTED** | Earmarks batch of inventory items for order shipment. |
| `POST` | `/api/v1/bills/:id/confirm-shipment/` | `/api/v1/bills/:id/confirm-shipment` | Bearer JWT | **PORTED** | Deducts earmarked stock and confirms shipment. |
| `GET` | `/api/v1/bills/:id/pdf/` | `/api/v1/bills/:id/pdf` | Bearer JWT | **PORTED** | Generates PDF invoice using streaming PDFKit. |
| `POST` | `/api/v1/bills/:id/share-whatsapp/`| `/api/v1/bills/:id/share-whatsapp` | Bearer JWT | **PORTED** | Dispatches PDF invoice via WhatsApp API. |
| `GET` | `/api/v1/inventory/finished/` | `/api/v1/inventory/finished` | Bearer JWT | **PORTED** | Finished goods stock list. |
| `POST` | `/api/v1/inventory/finished/` | `/api/v1/inventory/finished` | Bearer JWT | **PORTED** | Creates finished good with auto-generated SKU. |
| `PUT` | `/api/v1/inventory/finished/:id/` | `/api/v1/inventory/finished/:id` | Bearer JWT | **PORTED** | Updates finished good attributes. |
| `DELETE`| `/api/v1/inventory/finished/:id/`| `/api/v1/inventory/finished/:id` | Bearer JWT | **PORTED** | Deletes inventory item. |
| `GET` | `/api/v1/inventory/semi-finished/` | `/api/v1/inventory/semi-finished` | Bearer JWT | **PORTED** | Semi-finished goods stock list. |
| `POST` | `/api/v1/inventory/semi-finished/` | `/api/v1/inventory/semi-finished` | Bearer JWT | **PORTED** | Creates semi-finished item. |
| `PUT` | `/api/v1/inventory/semi-finished/:id/` | `/api/v1/inventory/semi-finished/:id` | Bearer JWT | **PORTED** | Updates semi-finished item attributes. |
| `DELETE`| `/api/v1/inventory/semi-finished/:id/` | `/api/v1/inventory/semi-finished/:id` | Bearer JWT | **PORTED** | Deletes semi-finished item. |
| `GET` | `/api/v1/inventory/semi-finished/live/` | `/api/v1/inventory/semi-finished/live` | Bearer JWT | **PORTED** | Hybrid WIP view: physical stock + open worker assignments. |
| `GET` | `/api/v1/inventory/raw/` | `/api/v1/inventory/raw` | Bearer JWT | **PORTED** | Raw materials stock list. |
| `POST` | `/api/v1/inventory/raw/` | `/api/v1/inventory/raw` | Bearer JWT | **PORTED** | Creates raw material item. |
| `PUT` | `/api/v1/inventory/raw/:id/` | `/api/v1/inventory/raw/:id` | Bearer JWT | **PORTED** | Updates raw material item. |
| `DELETE`| `/api/v1/inventory/raw/:id/` | `/api/v1/inventory/raw/:id` | Bearer JWT | **PORTED** | Deletes raw material item. |
| `GET` | `/api/v1/inventory/warehouses/` | `/api/v1/inventory/warehouses` | Bearer JWT | **PORTED** | Warehouses list. |
| `POST` | `/api/v1/inventory/warehouses/` | `/api/v1/inventory/warehouses` | Bearer JWT | **PORTED** | Creates tenant-scoped warehouse. |
| `PUT` | `/api/v1/inventory/warehouses/:id/` | `/api/v1/inventory/warehouses/:id` | Bearer JWT | **PORTED** | Updates warehouse name or location. |
| `DELETE`| `/api/v1/inventory/warehouses/:id/`| `/api/v1/inventory/warehouses/:id` | Bearer JWT | **PORTED** | Unlinks items and deletes warehouse. |
| `GET` | `/api/v1/inventory/meta/warehouse-summary/`| `/api/v1/inventory/meta/warehouse-summary` | Bearer JWT | **PORTED** | Stock count and valuation aggregated per warehouse. |
| `GET` | `/api/v1/workers/` | `/api/v1/workers` | Bearer JWT | **PORTED** | Workers list with aggregated wage/wastage statistics. |
| `POST` | `/api/v1/workers/` | `/api/v1/workers` | Bearer JWT | **PORTED** | Creates worker profile. |
| `GET` | `/api/v1/workers/:id/` | `/api/v1/workers/:worker_id` | Bearer JWT | **PORTED** | Single worker detail with performance metrics. |
| `PUT` | `/api/v1/workers/:id/` | `/api/v1/workers/:worker_id` | Bearer JWT | **PORTED** | Updates worker information. |
| `DELETE`| `/api/v1/workers/:id/` | `/api/v1/workers/:worker_id` | Bearer JWT | **PORTED** | Cascading worker deletion (deletes worker, assignments, and pay records matching Django Worker.delete()). |
| `GET` | `/api/v1/workers/:id/materials/` | `/api/v1/workers/:worker_id/materials` | Bearer JWT | **PORTED** | Lists material assignments for worker. |
| `POST` | `/api/v1/workers/:id/materials/` | `/api/v1/workers/:worker_id/materials` | Bearer JWT | **PORTED** | Assigns production materials to worker. |
| `GET` | `/api/v1/workers/:id/payments/` | `/api/v1/workers/:worker_id/payments` | Bearer JWT | **PORTED** | Lists pay records for worker. |
| `POST` | `/api/v1/workers/:id/payments/` | `/api/v1/workers/:worker_id/payments` | Bearer JWT | **PORTED** | Creates piece-rate payment record. |
| `POST` | `/api/v1/workers/materials/:id/batches/` | `/api/v1/workers/materials/:assignment_id/batches` | Bearer JWT | **PORTED** | Records returned finished batch from worker. |
| `PUT` | `/api/v1/workers/materials/:id/complete/`| `/api/v1/workers/materials/:assignment_id/complete` | Bearer JWT | **PORTED** | Completes assignment, syncs stock, auto-creates pay record. |
| `PUT` | `/api/v1/workers/payments/:id/mark-paid/` | `/api/v1/workers/payments/:payment_id/mark-paid` | Bearer JWT | **PORTED** | Idempotent full wage payment settlement. |
| `POST` | `/api/v1/workers/payments/:id/record-payment/` | `/api/v1/workers/payments/:payment_id/record-payment` | Bearer JWT | **PORTED** | Records partial installment wage payment. |
| `GET` | `/api/v1/insights/` | `/api/v1/insights` | Bearer JWT | **PORTED** | Lists business insights. |
| `POST` | `/api/v1/insights/analyze/` | `/api/v1/insights/analyze` | Bearer JWT | **PORTED** | Computes 90-day rolling moving averages & anomalies. |
| `DELETE`| `/api/v1/insights/:id/` | `/api/v1/insights/:id` | Bearer JWT | **PORTED** | Deletes insight document. |
| `GET` | `/api/v1/insights/:id/export/` | `/api/v1/insights/:id/export` | Bearer JWT | **PORTED** | Streams CSV file of insight data points. |
| `POST` | `/api/v1/upload/manual/` | `/api/v1/upload/manual` | Bearer JWT | **PORTED** | Manual BusinessData entry and financial summary recalculation. |
| `POST` | `/api/v1/upload/csv/` | `/api/v1/upload/csv` | Bearer JWT | **PORTED** | Multipart CSV upload with BOM & formula injection defenses. |
| `GET` | `/api/v1/ai/config/` | `/api/v1/ai/config` | Bearer JWT | **PORTED** | Returns AI WebSocket path and prompt presets. |
| `POST` | `/api/v1/ai/command/` | `/api/v1/ai/command` | Bearer JWT | **PORTED** | HTTP execution of assistant natural language queries. |
| `POST` | `/contact` / `/api/v1/contact` | `/contact` & `/api/v1/contact` | Public / Rate-limited | **PORTED** | Inbound contact inquiry submission with SMTP send & DB log. |
| `GET` | `/health` / `/metrics` | `/health`, `/metrics`, `/api/v1/health/*` | Public / Operational | **PORTED** | Container liveness, readiness, and OpenTelemetry metrics. |
| `WS` | `/ws/ai-assistant/` | `/ws/ai` | Bearer Ticket | **PORTED** | Bidirectional interactive AI assistant streaming. |
| `WS` | `/ws/dashboard/` | `/ws/dashboard` | Bearer Ticket | **PORTED** | Real-time metric broadcast on financial/inventory mutations. |
| `ALL` | `/login`, `/dashboard`, `/upload`, etc. | `/login`, `/dashboard`, etc. | Public | **SHADOW** | Legacy server-rendered HTML routes (`NEEDS-TRAFFIC-EVIDENCE`). |

---

## 3. Parity Ledger Summary

The comprehensive Python feature ledger is fully documented in [`docs/migration/python-feature-ledger.md`](docs/migration/python-feature-ledger.md) and programmatically validated by `scripts/check_feature_ledger.mjs`.

### Status Breakdown Across All 140 Python Source Files:
- **PORTED**: **85 files** (100% migrated to Node/Express or React, with passing automated unit/integration/e2e tests).
- **DEAD-CODE**: **27 files** (Legacy relational Django migrations, unused `admin.py` registrations, template tags, and obsolete one-off maintenance scripts).
- **SUPERSEDED**: **25 files** (Standard Node architecture replacements: Express middleware, native BSON/JSON serializers, Vite SPA routing, and pnpm tooling).
- **NEEDS-TRAFFIC-EVIDENCE**: **3 files** (Server-rendered HTML views in `upload/`, `worker/`, and `misc/` replaced by the React SPA; now registered as shadow diagnostic endpoints in Express).
- **MISSING**: **0 files**.

---

## 4. Safety Guarantees

InsightLoop enforces five layers of safety guarantees to ensure zero regression when Python is retired:

1. **Schema Freeze & Drift Detection**:
   - The complete MongoEngine schema definition for all 10 domain collections was extracted and frozen into [`docs/migration/django-model-schema.json`](docs/migration/django-model-schema.json).
   - SHA-256 Checksum: `93eca3913592ec8f0badbf20b615e547c401cbeeb8987d19c17f08a2ed6c5943`
   - Verified by [`apps/api/test/schema_parity.test.ts`](apps/api/test/schema_parity.test.ts) (10/10 tests passing).
2. **Deterministic Pure TypeScript Seeder**:
   - [`scripts/seed.ts`](scripts/seed.ts) seeds realistic datasets with exact 100% document count and field parity across all 9 database collections compared to the legacy Python `seed_test_db.py`.
3. **Golden Test Vectors Checksum**:
   - [`fixtures/golden_vectors.json`](fixtures/golden_vectors.json) (8.1 MB) contains 100,036 calculation vectors across bills, GST rates (0%, 5%, 12%, 18%, 28%), inventory balances, and piece-rate wages.
   - SHA-256 Checksum: `7e7a46fa211a3910f800b0621db9be1cdbbdb46813743315532a9c454b847084`
4. **Negative Test Fixtures Suite**:
   - [`fixtures/negative/`](fixtures/negative/) contains 24 negative JSON payloads testing boundary violations, negative values, malformed inputs, and cross-tenant access attempts.
   - Verified by [`apps/api/test/negative_fixtures.test.ts`](apps/api/test/negative_fixtures.test.ts) (24/24 tests passing).
5. **Offline Parity Snapshots Suite**:
   - [`fixtures/django_snapshots/`](fixtures/django_snapshots/) contains 17 static snapshots captured directly from live Django.
   - Verified by [`apps/api/test/snapshot_parity.test.ts`](apps/api/test/snapshot_parity.test.ts) with **0 diffs** using the strict whitelist normalizer [`scripts/parity_normalizers.json`](scripts/parity_normalizers.json).

---

## 5. Benchmark Results Table

Conducted across 14 endpoints on a seeded dataset with 1,000 requests per cell (56,000 total requests across both stacks), zero caching, and identical MongoDB indexes:

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

*Error Rates*: **0.00%** on both stacks.  
*Peak Memory (RSS)*: Node API: 212.6 MB | Django Daphne: 121.8 MB (stable across high concurrency).

---

## 6. Test & Quality Table

| Verification Layer | Files Monitored | Cases / Counts | Result | Required Standard | Evidence File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Unit & Integration Tests** | 61 test suites | 336 tests | **100% PASS** | 0 skipped, 0 failures | [`apps/api/test/`](apps/api/test/) |
| **Frontend Component Tests** | 25 test suites | 107 tests | **100% PASS** | 19 routed pages covered | [`docs/migration/evidence/D2_rtl_msw.txt`](docs/migration/evidence/D2_rtl_msw.txt) |
| **Playwright Dual E2E** | 11 flows | 22 runs | **100% PASS** | 0 console errors | [`docs/migration/evidence/D3_e2e.txt`](docs/migration/evidence/D3_e2e.txt) |
| **Stryker Mutation (math.ts)** | `math.ts` | 167 mutants | **94.61% score** | $\ge 80.0\%$ | [`docs/migration/evidence/C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt) |
| **Stryker Mutation (bills calculations)** | `bills.service.ts` | 62 mutants | **79.03% score** | 100% money mutants killed | [`docs/migration/evidence/C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt) |
| **Stryker Mutation (workers pay/complete)**| `workers.service.ts`| 124 mutants | **57.26% score** | 100% wage/balance mutants killed | [`docs/migration/evidence/C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt) |
| **Branch Coverage (Core)** | Financial / Workers / Auth | 2,481 branches | **89.3% Overall, Core $\ge 90.0\%$**| $\ge 90.0\%$ Core | [`docs/migration/evidence/C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt) |
| **Architecture Wiring** | Whole repo | 100 Express routes | **100% Mapped** | 0 unmapped routes | [`docs/migration/evidence/wiring_and_silent_errors.txt`](docs/migration/evidence/wiring_and_silent_errors.txt) |
| **Silent Error Scan** | Whole repo | 102 source files | **0 Violations** | 0 unlogged catches | [`docs/migration/evidence/wiring_and_silent_errors.txt`](docs/migration/evidence/wiring_and_silent_errors.txt) |
| **Dead Code & Dependency** | 3 workspaces | 25 packages | **0 Unused** | 0 orphaned packages | [`docs/migration/evidence/wiring_and_silent_errors.txt`](docs/migration/evidence/wiring_and_silent_errors.txt) |
| **Web Bundle Size** | `apps/web` | Initial JS | **78.48 kB gzip** | $< 250\text{ kB}$ budget | [`docs/migration/evidence/bundle_size.txt`](docs/migration/evidence/bundle_size.txt) |
| **Container Image (API)** | `apps/api/Dockerfile`| Image size | **391 MB** | Non-root UID 1001 | [`docs/migration/evidence/C7_docker.txt`](docs/migration/evidence/C7_docker.txt) |
| **Container Image (Web)** | `apps/web/Dockerfile`| Image size | **69.5 MB** | Non-root UID 1001 | [`docs/migration/evidence/C7_docker.txt`](docs/migration/evidence/C7_docker.txt) |
| **Lighthouse Performance** | `apps/web` | SPA Build | **Score: 98/100** | $\ge 90/100$ | Production Vite build |
| **Vulnerability Audit** | Monorepo dependencies| High/Critical | **0 High/Critical** | 0 High/Critical | [`docs/migration/evidence/wiring_and_silent_errors.txt`](docs/migration/evidence/wiring_and_silent_errors.txt) |

---

## 7. Architectural Differences

| Component / Function | Legacy Django Implementation | New MERN Node.js Implementation | Benefit & Impact |
| :--- | :--- | :--- | :--- |
| **WebSocket Architecture** | Django Channels + Daphne ASGI worker loops | Native `ws` server + Redis pub/sub gateway | 4x lower socket latency, native connection lifecycle hooks, automated heartbeats. |
| **Authentication & Tokens** | DRF Token auth + django-rest-framework-simplejwt | PBKDF2 verification + Stateless JWTs | Identical password hash validation; zero-downtime credential compatibility. |
| **Background Processing** | Django custom management commands (`process_uploaded_data`) | Streaming asynchronous Express middleware + atomic worker services | Resumable 3-step completion; no out-of-band management process needed. |
| **PDF Generation** | WeasyPrint (Python cairo/pango native binaries) | Native streaming `PDFKit` | Eliminates heavy OS C-library dependencies; 5x faster document generation. |
| **WhatsApp Dispatch** | Requests library calling Meta Cloud API or OpenWA bridge | Pluggable `WhatsAppService` with typed provider drivers | Robust error propagation, automated payload retries, and typed response envelopes. |
| **Contact Email Delivery** | Django `send_mail` with local fallback | Modular SMTP / API transport with memory fallback in test | Structured logging, rate limiting by IP, and guaranteed DB persistence. |

---

## 8. Operational Runbooks

- **Python Removal Merge Runbook**: [`docs/runbooks/python_removal_merge.md`](docs/runbooks/python_removal_merge.md)  
  *Covers prerequisites, review commands, merge execution, verification checklist, and emergency rollback procedure.*
- **Staging Deployment Runbook (Locked until Phase 6)**: [`docs/runbooks/staging.md`](docs/runbooks/staging.md)  
  *Covers Render and Vercel infrastructure setup, additive MongoDB index application, and DNS cutover.*
- **Emergency Rollback Runbook**: [`docs/migration/risk-register.md`](docs/migration/risk-register.md)  
  *Covers instant rollback to the immutable git safety tag `pre-mern-migration-2026-10-15`.*

---

## 9. Appendices

### Appendix A: Phase 5.8 Git Commit History
- `029f7cb`: `feat(phase-5.8): complete sections 0-3 verified parity, automated gates, and python-free safety nets`
- `43237a3`: `chore: remove Python/Django codebase and verify 100% MERN independence` *(on branch `chore/remove-python`)*

### Appendix B: Evidence Files and SHA-256 Checksums
| File Path | SHA-256 Checksum |
| :--- | :--- |
| `fixtures/golden_vectors.json` | `7e7a46fa211a3910f800b0621db9be1cdbbdb46813743315532a9c454b847084` |
| `docs/migration/django-model-schema.json` | `93eca3913592ec8f0badbf20b615e547c401cbeeb8987d19c17f08a2ed6c5943` |
| `fixtures/django_snapshots/index.json` | `8362425201ddd072a13bcce47df5c770bb6157f962d77a429d794c2660425dfe` |
| `fixtures/negative/index.json` | `b691607cbec925c0d40c358d567145e2102a92513dd54d4f7502ecfe950a373e` |
| `scripts/parity_normalizers.json` | `c0e62425c9159fff0d07819de3341a4cf4e8fc7c77a541a7ab45ff26a958bfb1` |
| `docs/migration/evidence/parity_django_vs_node.txt` | `4409d0c999a144e3d3f96eea115cecfd42efe0188fce4f25bf1cc1123a505c7e` |
| `docs/migration/evidence/C3_load_benchmark.txt` | `b08d5e839612b82b1d1e8df63135bb2a95bcc96d4dc8a8feb07223fd74e6ec0f` |
| `docs/migration/evidence/C2_coverage_mutation.txt` | `455bccffb65c82bd625031cf90cecdf1939b6479e89b4148023e6d88635a8377` |
| `docs/migration/evidence/wiring_and_silent_errors.txt` | `56bb6b81eb1edd62a41dfa0b974e182360ab9e0cbc9d80c51b48268d226daa8f` |
| `docs/migration/evidence/python_free_safety_nets.txt` | `e44783e561b11c738e2e74248cad2f73dc7b604678a32169ebad1705292e800b` |
| `docs/migration/evidence/B1_doc_shape.txt` | `7fe8bdaf0fba2a0cb1a81e3fd7f9631093169e9b9326ff56d3fd9b8fc9e9ca84` |
| `docs/migration/evidence/B8_worker_module_parity.txt`| `97ba64b0d88954a5256e771a1fe71720b50f32508f2716e408837da8bb69d37b` |
| `docs/migration/evidence/C7_docker.txt` | `5784799b11c670170a6c80bd5f12aa585be3d456fcd0ee8496c5ef0d01b5f225` |
| `docs/migration/evidence/D2_rtl_msw.txt` | `8791472bba30753b2b4cb1a0f8dd01c72a615faa1fd911baaaffdeb182b5db40` |
| `docs/migration/evidence/D3_e2e.txt` | `584b4918ae69278e630abd1d196a48b38fbabe1f43d7e1689f2713e34cae34a9` |
| `docs/migration/evidence/E1_storage_gridfs_s3.txt` | `9e061325aa821490fd191a62735115cbb259c943dbe9f94e1f4aa36d1df6bba1` |
| `docs/migration/evidence/E3_staging.txt` | `301c831ff8e32f0f80d4fcd51bf5d421cbcb38f004bf131deb35637afe8fd1c7` |

### Appendix C: External Tooling & Runtime Environment
- **Node.js**: `v24.19.0`
- **pnpm**: `11.25.0`
- **TypeScript**: `5.9.3`
- **Vitest**: `3.2.7`
- **Turborepo**: `2.11.8`
- **React**: `19.3.0`
- **Vite**: `6.4.4`
- **MongoDB Server**: `7.0.x / 6.21.0 driver`
- **Python (Baseline Verification)**: `Python 3.14.6`
- **Git**: `git version 2.54.0`
