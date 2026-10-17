# Final Cleanup Inventory & Candidate Classification

Captured on branch `chore/final-cleanup` (base: `main` at `915c367`).
All candidates audited across source code, `package.json`, CI workflows, Dockerfiles, Vite/tsconfig files, documentation, and operational scripts.

---

## Candidate Classification Table

| Path / Target | Category | What it is | Proof of Unused / Reference Points Searched | Decision | Justification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `.venv/` | A | Untracked Python virtual environment folder | Project is 100% Node/TS Turborepo. Zero runtime Python dependencies remain. | **REMOVE** | Python virtualenv is dead code post-migration. |
| `insightloop/` | A | Untracked legacy Django application folder | Contains untracked `__pycache__`, `.env`, `db.sqlite3`, `media/`, `static/`. All tracked files were removed in PR #2. | **REMOVE** | Legacy Django application files completely superseded by `apps/api`. |
| `scripts/__pycache__/` | A | Python bytecode cache directory | All `.py` scripts have been removed. | **REMOVE** | Stale bytecode cache. |
| `.vscode/settings.json` | A | Untracked VS Code configuration | Contains `"python.analysis.extraPaths": ["./insightloop/insightloop"]`. | **REMOVE** | References deleted Python paths. |
| `render.yaml` | A | Legacy Render service definition | Specifies `env: python`, `pip install -r requirements.txt`, `daphne`. Live Node service uses `render-blueprint.yaml`. | **REMOVE** | Obsolete Django service configuration. |
| `.gitignore` (Python entries) | A | Git ignore patterns for Python/Django | Lines 1-28 (`*.pyc`, `manage.py`, etc.), lines 30-38 (`staticfiles/`, `/insightloop/`), lines 41-48 (`venv/`), line 55 (`insightloop/.env`), line 89 (`.pydevproject`), lines 100-103 (`.coverage`, `.pytest_cache/`). | **REMOVE** | Clean up stale Python/Django ignore rules. |
| `.dockerignore` (line 5) | A | `.venv` ignore entry in Docker ignore | References deleted `.venv` folder. | **REMOVE** | Clean up `.dockerignore`. |
| `.github/workflows/ci.yml` (branch list) | A | CI trigger branches `migration/mern`, `chore/remove-python` | Both branches have been fully merged into `main`. | **REMOVE** | Clean up CI triggers to track `main`. |
| `apps/api/src/config/env.ts` (fallbacks) | E | Django env variable fallbacks (`DJANGO_SECRET_KEY`, `DJANGO_CORS_ALLOWED_ORIGINS`, `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_REGION_NAME`) | Audited against `render-blueprint.yaml`, `apps/api/src`, and live Render environment. Node service uses canonical `JWT_SECRET`, `CORS_ORIGIN`, `S3_BUCKET_NAME`, `AWS_REGION`. | **REMOVE** | Section 2E explicit requirement. |
| `apps/api/test/cors.test.ts` (lines 42-60) | E | Fallback unit test for `DJANGO_CORS_ALLOWED_ORIGINS` | Tests the removed fallback alias in `env.ts`. | **REMOVE** | Accompanying test for removed fallback. |
| `scripts/test_render_production_boot.mjs` | E | Boot test relying on `DJANGO_SECRET_KEY` fallback | Boots Node with `DJANGO_SECRET_KEY`. Superseded by `scripts/test_render_boot.mjs` which tests canonical `JWT_SECRET`. | **REMOVE** | Fallback-specific test script. |
| `apps/api/src/config/env.ts` (`REHASH_PASSWORDS_ON_LOGIN`) | E | Boolean env config for password rehashing | Present in schema and `env_and_jwt_derivation.test.ts`. Not read in `auth.service.ts`. | **KEEP** | Per Section 2E: "Keep `REHASH_PASSWORDS_ON_LOGIN` only if used and tested; otherwise list as a decision for me, do not remove it." |
| `apps/api/src/modules/legacy/legacy.routes.ts` | B | Express router for legacy routes | Router is empty (`legacyRouter = Router()`) with 0 routes. `app.ts` handles `/` and 404 directly. | **REMOVE** | Empty migration router per Section 2B. |
| `apps/api/src/app.ts` (`legacyRouter`) | B | Import and `app.use(legacyRouter)` mount | Mounts the empty legacy router. Verified 0 routes registered. | **REMOVE** | Unnecessary router mount per Section 2B. |
| `apps/api/test/legacy_routes.test.ts` | B | Public root and 404 integration tests | Tests `GET /` and 404 response shapes in `app.ts`. | **KEEP** | Critical regression test for root redirect and 404 error envelope. Renamed/retained. |
| `scripts/record_django_snapshots.mjs` | B | Script to fetch snapshots from Django port 8000 | Django is decommissioned. Snapshots in `fixtures/django_snapshots/` are frozen and verified. | **REMOVE** | Migration-only script per Section 2B. |
| `scripts/run_true_dual_parity.mjs` | B | 71-check automated dual-stack parity runner | Compares live Django Daphne (port 8001) vs Node (port 4000). | **REMOVE** | Dual-stack runner per Section 2B. |
| `scripts/test_dual_stack.mjs` | B | Dual-stack test script | Calls Django API on port 8000. | **REMOVE** | Dual-stack runner per Section 2B. |
| `scripts/test_b7_upload_rules_dual_stack.mjs` | B | Dual-stack CSV upload test | Calls Django port 8000. | **REMOVE** | Dual-stack runner per Section 2B. |
| `scripts/test_timezone_dual_parity.mjs` | B | Dual-stack timezone parity test | Calls `.venv/bin/python scripts/seed_test_db.py` and Django port 8000. | **REMOVE** | Dual-stack runner per Section 2B. |
| `scripts/test_worker_module_parity.mjs` | B | Dual-stack worker module parity script | Executes `.venv/bin/python` to reseed and test against Django. | **REMOVE** | Dual-stack runner per Section 2B. |
| `scripts/verify_dashboard_parity.mjs` | B | Dashboard parity comparison script | Calls `.venv/bin/python` and Django port 8000. | **REMOVE** | Dual-stack runner per Section 2B. |
| `scripts/run_load_benchmark.mjs` | B | Concurrent load benchmark comparing Django vs Node | Sends requests to Django port 8000 and Node port 4000. | **REMOVE** | Benchmark comparing against Django per Section 2B. |
| `package.json` (`test:dual-stack`, `test:benchmark`) | B | npm script entries calling removed scripts | References `scripts/test_dual_stack.mjs` and `scripts/run_load_benchmark.mjs`. | **REMOVE** | Stale script entries. |
| `docs/runbooks/canary_rollback.md` | B | Runbook detailing traffic shifting & rollback to Django | Mentions Cloudflare routing to Django and standby Django port 8000. | **ARCHIVE** | Move to `docs/archive/canary_rollback.md`; replace with Node-only deployment rollback runbook. |
| `docs/runbooks/python_removal_merge.md` | B | Runbook for merging `chore/remove-python` | Procedure is already executed. | **ARCHIVE** | Move to `docs/archive/python_removal_merge.md`. |
| `apps/web/src/styles/tokens.ts` | C | CSS/color design tokens file | Knip scan: unused file. Grep scan: 0 imports across entire monorepo. | **REMOVE** | Dead code. |
| `apps/api/package.json` (`pino-http`) | C | Unused dependency in `apps/api` | Pino is imported directly via `pino` in `logger.ts`. `pino-http` is never imported. | **REMOVE** | Dead dependency. |
| `apps/web/package.json` (`@insightloop/shared`) | C | Unused workspace dependency in `apps/web` | Grep scan: 0 imports of `@insightloop/shared` in `apps/web/src`. | **REMOVE** | Dead dependency. |
| `commitlint.config.js` | C | Duplicate commitlint configuration | Duplicate of `commitlint.config.mjs`. | **REMOVE** | Redundant file. |
| `apps/api/src/modules/bills/bills.service.ts` (`linkedPayRecords`) | C | Unused parameter in `serializeBillSync` | Flagged by `tsc --noUnusedParameters`. | **REMOVE** | Dead parameter. |
| `apps/api/src/utils/jwt.ts` (`verifyRefreshToken`) | C | Unused helper function export | Auth refresh route uses `verifyToken(token, 'refresh')`. | **REMOVE** | Unused export. |
| `apps/api/test/testHelper.ts` (`export { getCollection }`) | C | Unused re-export | All tests import `getCollection` directly from `src/db/mongo.js`. | **REMOVE** | Dead re-export. |
| `MIGRATION_REPORT.md` (root) | D | Duplicate migration report | Duplicate of migration report in `docs/migration/`. | **ARCHIVE** | Move to `docs/archive/MIGRATION_REPORT.md`. |
| `docs/migration/MIGRATION_REPORT.md` | D | Historical Phase 5.9 migration report | Historical document. Replaced by `docs/MIGRATION_HISTORY.md`. | **ARCHIVE** | Move to `docs/archive/phase5_migration_report.md`. |
| `docs/migration/phase8_django_decommissioning_plan.md` | D | Decommissioning plan document | Completed plan. | **ARCHIVE** | Move to `docs/archive/`. |
| `docs/migration/audit_evidence/` | D | Transient test run outputs | 5 `.txt` files from prior audit passes. | **REMOVE** | Generated test output. |
| `docs/migration/evidence/*` (generated logs & pdf/png diffs) | D | Over 70 generated evidence files, benchmark outputs, image diffs | Historical parity outputs from dual-stack phase. | **ARCHIVE / REMOVE** | Archive key summaries; delete redundant generated logs/images; replace with `docs/MIGRATION_HISTORY.md`. |
| `docs/migration/django-model-schema.json` & `.sha256` | D | Frozen Django model schema & checksum | Read at runtime by `test/schema_parity.test.ts`, `apps/api/test/schema_parity.test.ts`, and `scripts/check_doc_shape.mjs`. | **KEEP** | Active regression safety net per Hard Rule 4. |
| `docs/migration/public-api-surface.md` | D | Registered route catalog & web mapping | Read at runtime by `scripts/check_wiring.mjs` to verify zero undocumented endpoints. | **KEEP** | Active CI check requirement. |
| `docs/migration/django-vs-node-audit.md` | D | Symbol-by-symbol migration cross-reference | Read at runtime by `scripts/check_citations.mjs`. | **KEEP** | Active CI check requirement. |
| `docs/migration/python-feature-ledger.md` | D | Comprehensive feature migration ledger | Read at runtime by `scripts/check_feature_ledger.mjs`. | **KEEP** | Active CI check requirement. |
| `fixtures/django_snapshots/` | D | Golden JSON snapshots captured from Django | Read at runtime by `test/snapshot_parity.test.ts`. | **KEEP** | Active regression safety net per Hard Rule 4. |
| `fixtures/golden_vectors.json` | D | Golden mathematical calculation fixtures | Read at runtime by `packages/shared/test/math.test.ts`. | **KEEP** | Active regression safety net per Hard Rule 4. |
| `scripts/parity_normalizers.json` | D | Normalizer configuration for snapshot comparison | Read at runtime by `test/snapshot_parity.test.ts` and `apps/api/test/parity_normalizers.test.ts`. | **KEEP** | Active regression safety net per Hard Rule 4. |

---

## Execution Order

In strict accordance with Section 3:
1. **Batch 1 (Category A)**: Python & Django leftovers (`.venv`, `insightloop`, `scripts/__pycache__`, `.vscode`, `render.yaml`, `.gitignore`, `.dockerignore`, `.github/workflows/ci.yml`).
2. **Batch 2 (Category E)**: Environment fallbacks in `apps/api/src/config/env.ts`, `apps/api/test/cors.test.ts`, `scripts/test_render_production_boot.mjs`, update `docs/runbooks/env_mapping.md`.
3. **Batch 3 (Category B)**: Migration-only tooling (`legacyRouter` removal from `legacy.routes.ts` and `app.ts`, dual-stack scripts removal, package.json scripts cleanup, runbook archive).
4. **Batch 4 (Category C)**: Dead code in `apps/api`, `apps/web`, `packages/shared` (`tokens.ts`, unused dependencies `pino-http`, `@insightloop/shared`, `commitlint.config.js`, unused parameter in `bills.service.ts`, unused exports).
5. **Batch 5 (Category D)**: Evidence, reports and generated output cleanup, creation of `docs/MIGRATION_HISTORY.md`, rewrite of `README.md`, update `docs/runbooks/`.
6. **Batch 6 (Section 5)**: Implement `scripts/check_no_python.mjs`, wire into root `package.json` and CI, verify with negative and positive tests.
