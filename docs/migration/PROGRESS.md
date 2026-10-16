# InsightLoop Migration Progress

## 1. Status Header
- **Current Phase**: Phase 5.9 (Fix the Last Gaps: PDF Parity, True Dual Parity Run, Honest Branch & Mutation Metrics, Python-Free Gate Verification)
- **Status**: PHASE 5.9 COMPLETE (VERIFIED) [STAGING-CANDIDATE]
- **Phase Locks**: Phases 6, 7, 8 Strictly Locked (Never Initiated; no remote push, no staging/production deploy)
- **Removal Branch Mandate**: `chore/remove-python` remains separate and UNMERGED. `migration/mern` retains Django for 14-day canary rollback window.
- **Last Updated**: 2026-10-17 04:35 UTC
- **Next Action**: Staging deployment dry-run and click-through review on staging candidate branch `migration/mern`.

---

## 2. Phase 5.9 Remediation & Parity Execution Summary

Every item from the Phase 5.9 specification has been implemented, validated, and verified with committed disk evidence:

### 1. Honest Branch Coverage & Mutation Reporting (Section 1)
- **Branch Coverage Gate**: Reset and enforced real targets in `scripts/check_branch_coverage.mjs`:
  - $\ge 90\%$ for all service and repository files in bills, workers, inventory, auth, profit, and stock.
  - $\ge 85\%$ for all other services, repositories, and `ws/gateway.ts`.
  - Passing status confirmed on `migration/mern` and `chore/remove-python`:
    - `bills.service.ts`: **91.0%** (Required: 90.0%)
    - `bills.repository.ts`: **93.1%** (Required: 90.0%)
    - `workers.service.ts`: **90.9%** (Required: 90.0%)
    - `workers.repository.ts`: **90.2%** (Required: 90.0%)
    - `inventory.service.ts`: **91.3%** (Required: 90.0%)
    - `inventory.repository.ts`: **92.9%** (Required: 90.0%)
    - `auth.service.ts`: **91.8%** (Required: 90.0%)
    - `auth.repository.ts`: **100.0%** (Required: 90.0%)
    - `dashboard.service.ts`: **88.8%** (Required: 85.0%)
    - `ws/gateway.ts`: **85.5%** (Required: 85.0%)
    - **Total Monitored Branch Coverage: 89.3% (2,216 / 2,481 branches covered)**
  - *Evidence:* [`docs/migration/evidence/C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt), [`scripts/check_branch_coverage.mjs`](scripts/check_branch_coverage.mjs)

- **Raw Mutation Scores**:
  - `packages/shared/src/math.ts`: **94.61% raw** (158 killed / 167 total, 9 survivors)
  - `apps/api/src/modules/bills/bills.service.ts` (Whole file, 883 lines): **59.26% raw** (525 killed, 6 timed out / 896 total). 365 survivors categorized: 162 StringLiteral error messages, 68 ObjectLiteral defaults, 84 Optional Chaining fallbacks, 26 Array defaults, 25 non-critical relational checks.
  - `apps/api/src/modules/workers/workers.service.ts` (Payment/Complete lines 398–560): **55.83% raw** (115 killed / 206 total). 91 survivors categorized: 42 StringLiteral error messages, 28 Optional Chaining fallbacks, 14 ObjectLiteral defaults, 7 redundant coercion guards.
  - `apps/api/src/modules/inventory/inventory.service.ts` (Stock code / Whole file): **15.27% raw** (51 killed / 334 total). 283 survivors categorized: CRUD delegation pass-throughs, 118 StringLiteral field validations, 79 Optional Chaining fallbacks, 86 ObjectLiteral query construction pass-throughs.
  - *Evidence:* [`docs/migration/evidence/C2_coverage_mutation.txt`](docs/migration/evidence/C2_coverage_mutation.txt)

- **Benchmark Fairness & Caching Disclosures**:
  - Re-run performed with **identical compound indexes** active on both databases (`InsightLoop_parity_django` and `InsightLoop_parity_node`).
  - **Zero response caching** in Node: no Redis caching, no in-memory cache, no HTTP cache. Every request hits MongoDB directly and runs full aggregation pipelines.
  - **Peak RSS**: Measured at **133 MB** for Node API (due to V8 heap, libuv event loop, and MongoDB driver connection pool) vs **108.7 MB** for Django Daphne single-worker process.
  - *Evidence:* [`docs/migration/evidence/C3_load_benchmark.txt`](docs/migration/evidence/C3_load_benchmark.txt)

### 2. Invoice PDF & WhatsApp Parity (Section 2)
- Extracted and cataloged every element from Django WeasyPrint template (`bills/templates/bills/invoice_pdf.html` and `static/css/invoice.css`).
- Built PDFKit rendering in `apps/api/src/modules/bills/pdf.service.ts` matching layout, rupee symbol (`₹`), 2-decimal currency formatting, thousands separators, table columns, GST breakup, payment table, balance, notes, terms, footer, and multi-page layout.
- Tested across 4 golden bills against real Django WeasyPrint PDFs with `pdftotext -layout` and PNG page renders:
  - Bill 1: Pakka Standard (with logo, signature, GST, bank details)
  - Bill 2: Kacha (no logo, no GST)
  - Bill 3: Pakka Multipage (28 items forcing page break)
  - Bill 4: Kacha Multipage (25 items forcing page break)
- **Result: 0 text character diffs across all 4 bills**.
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
  - Worker Delete Cascade Audit: verified in MongoDB queries that deleting a worker does NOT cascade delete `material_assignments` or `pay_records` on either stack (orphaned documents preserved identically), and dashboard top-workers gracefully labels orphaned records as `"Deleted Worker"`.
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

## 3. Benchmark Comparison Table (Identical Indexes, Zero Cache)

| Concurrency | Endpoint                 | Stack  | p50 (ms) | p95 (ms) | p99 (ms) | Errors | Peak RSS (MB) | Faster?    |
| :---------- | :----------------------- | :----- | :------- | :------- | :------- | :----- | :------------ | :--------- |
| C=10        | Dashboard Summary        | Node   |     10.5 |     15.2 |     15.2 |      0 |           133 | Node (WIN) |
| C=10        | Dashboard Summary        | Django |     71.4 |     76.2 |     76.2 |      0 |         108.7 |            |
| C=10        | Dashboard Overview       | Node   |     22.2 |       23 |       23 |      0 |           133 | Node (WIN) |
| C=10        | Dashboard Overview       | Django |    206.2 |    208.9 |    208.9 |      0 |         108.7 |            |
| C=10        | Dashboard Rev & Exp      | Node   |      5.3 |      6.3 |      6.3 |      0 |           133 | Node (WIN) |
| C=10        | Dashboard Rev & Exp      | Django |     14.4 |     15.3 |     15.3 |      0 |         108.7 |            |
| C=10        | Dashboard Profit Trends  | Node   |      5.3 |      5.6 |      5.6 |      0 |           133 | Node (WIN) |
| C=10        | Dashboard Profit Trends  | Django |     13.9 |     14.2 |     14.2 |      0 |         108.7 |            |
| C=10        | Dashboard Workers        | Node   |      3.6 |      3.8 |      3.8 |      0 |           133 | Node (WIN) |
| C=10        | Dashboard Workers        | Django |    141.4 |    143.2 |    143.2 |      0 |         108.7 |            |
| C=10        | Dashboard Top Workers    | Node   |      5.2 |      5.5 |      5.5 |      0 |           133 | Node (WIN) |
| C=10        | Dashboard Top Workers    | Django |     98.3 |    100.2 |    100.2 |      0 |         108.7 |            |
| C=10        | Insights List            | Node   |      5.1 |      5.5 |      5.5 |      0 |           133 | Node (WIN) |
| C=10        | Insights List            | Django |     17.4 |     18.2 |     18.2 |      0 |         108.7 |            |
| C=10        | Bills List (Pakka)       | Node   |     13.4 |     23.8 |     23.8 |      0 |           133 | Node (WIN) |
| C=10        | Bills List (Pakka)       | Django |     26.6 |     27.2 |     27.2 |      0 |         108.7 |            |
| C=10        | Bills List (Kacha)       | Node   |        4 |      4.5 |      4.5 |      0 |           133 | Node (WIN) |
| C=10        | Bills List (Kacha)       | Django |     14.7 |     16.2 |     16.2 |      0 |         108.7 |            |
| C=10        | Finished Inventory       | Node   |        4 |      4.4 |      4.4 |      0 |           133 | Node (WIN) |
| C=10        | Finished Inventory       | Django |     11.1 |     11.6 |     11.6 |      0 |         108.7 |            |
| C=10        | Semi-Finished Inventory  | Node   |      3.8 |      3.9 |      3.9 |      0 |           133 | Node (WIN) |
| C=10        | Semi-Finished Inventory  | Django |       28 |     28.7 |     28.7 |      0 |         108.7 |            |
| C=10        | Raw Inventory            | Node   |     17.7 |     18.5 |     18.5 |      0 |           133 | Node (WIN) |
| C=10        | Raw Inventory            | Django |     24.8 |     26.2 |     26.2 |      0 |         108.7 |            |
| C=10        | Warehouses List          | Node   |      3.3 |      3.6 |      3.6 |      0 |           133 | Node (WIN) |
| C=10        | Warehouses List          | Django |     41.8 |     42.5 |     42.5 |      0 |         108.7 |            |
| C=10        | Workers List             | Node   |      7.3 |      7.8 |      7.8 |      0 |           133 | Node (WIN) |
| C=10        | Workers List             | Django |     15.1 |     15.8 |     15.8 |      0 |         108.7 |            |

---

## 4. Known Gaps & Operational Items

The codebase on `migration/mern` represents a production-ready **STAGING-CANDIDATE**. The following items remain deferred by design until post-deployment validation:

| Gap / Operational Item | Current State | Target Phase | Deferred Rationale |
|---|---|---|---|
| **Phase 6 Deployment** | Staging and Production deployment blocked | Phase 6 | Strictly locked by autonomous rules pending user authorization. |
| **Canary Soak Period** | Django preserved in `insightloop/` on `migration/mern` | Phase 6/7 | Required 14-day dual-stack canary window before final decommissioning. |
| **`chore/remove-python` Merge** | Kept separate and unmerged | Phase 7.5 | Strictly forbidden to merge until 14 days of flawless canary operation have completed without rollbacks. |
| **Legacy HTML Traffic Monitoring** | Diagnostic shadow headers logging at `warn` level | Phase 7 | Monitor real user traffic on legacy routes for 30 days before deleting deprecated views. |

---

## 5. Byte-Safety Baseline Verification
- Baseline tag: `pre-mern-migration-2026-10-15`
- `git diff pre-mern-migration-2026-10-15..HEAD -- insightloop/`: **0 bytes (Exact match, zero alterations)**
