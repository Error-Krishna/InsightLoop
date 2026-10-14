# InsightLoop Migration Progress

## 1. Status Header
- **Current Phase**: Phase 1 (Characterization / Golden Master Tests Against Django)
- **Current Module**: Test Harness & Golden Master Fixtures
- **Status**: IN PROGRESS
- **Last Updated**: 2026-10-15 03:12 UTC
- **Next Action**: Build Python math vector generator and Vitest contract test suite against running Django instance.

---

## 2. ATTENTION (Critical Alerts & Immediate Actions)
*None at this time.*

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

### Phase 0.5: Snapshot Scans, Storage & Contact Verifications
- [x] Pre-flight storage & ephemeral disk verification (`2026-10-15`)
- [x] Contact form (`/contact`) SMTP & database logging verification (`2026-10-15`)
- [x] Baseline test database connection verified (`InsightLoop_test`) (`2026-10-15`)

### Phase 1: Characterization ("Golden Master") Tests Against Django
- [ ] Stand up Django against disposable local test database (`InsightLoop_test`)
- [ ] Golden mathematical vectors generated from Python (`roundPy`, profit, bills, metrics)
- [ ] Language-agnostic HTTP contract suite targeting 100% of endpoints
- [ ] Record golden request/response fixtures into `apps/api/test/contracts/fixtures/`

### Phase 2: Monorepo Scaffolding & Tooling
- [ ] Turborepo + pnpm workspaces initialization
- [ ] Shared packages (`packages/shared`, `packages/tsconfig`, `packages/eslint-config`)
- [ ] Move `frontend/` to `apps/web/` preserving history and build integrity
- [ ] Husky v9 + lint-staged + commitlint configuration
- [ ] CI workflow setup (`.github/workflows/ci.yml`)
- [ ] Docker compose dev environment (`mongo`, `redis`)

### Phase 3: Build Node API Module by Module (`apps/api`)
- [ ] `core`: Error handling (`AppError`), Async handler, Logger (Pino), Security (Helmet, CORS), DB, Redis, WS gateway
- [ ] Module 1: `health` (`/health/live`, `/health/ready`)
- [ ] Module 2: `auth` (`/auth/login`, `/signup`, `/google`, `/refresh`, Django PBKDF2 verification, JWT HS256)
- [ ] Module 3: `profile` (`/profile/`, `/profile/settings/`, GridFS profile picture)
- [ ] Module 4: `inventory` (`finished/`, `semi-finished/`, `raw/`, `warehouses/`, `warehouse-summary/`, `live/`, atomic SKU)
- [ ] Module 5: `workers` (Workers CRUD, `materials/`, `batches/`, `complete()`, `payments/`, `record-payment/`, `mark-paid/`)
- [ ] Module 6: `bills` (Bills CRUD, `kacha/`, `pakka/`, `convert/`, payments, profit preview & confirm, atomic `INV-YYYY-NNNNN`, PDF, WhatsApp)
- [ ] Module 7: `dashboard` (`summary/`, `rev-exp/`, `profit-trends/`, `workers/`, `top-workers/`, and WS `dashboard_<id>`)
- [ ] Module 8: `insights` (`insights/`, `analyze/`, detail, CSV export, TTL index)
- [ ] Module 9: `upload` (`csv/`, `manual/`, streaming CSV parser, formula injection defense, ported `process_uploaded_data`)
- [ ] Module 10: `ai` (`config/`, `command/`, and WS `ai_assistant_<id>`)

### Phase 4: Frontend Migration to TypeScript + Production Architecture
- [ ] Convert `apps/web` leaf components and utilities to TypeScript
- [ ] Convert features (`auth`, `dashboard`, `bills`, `inventory`, `workers`, `insights`, `upload`, `profile`, `ai`)
- [ ] Typed API client integration with `packages/shared` Zod schemas
- [ ] Single-flight refresh token mutex in Axios interceptor
- [ ] Full RTL component tests and Playwright E2E test suite

### Phase 5: Parity Verification, Load, Chaos & Security Sweets
- [ ] Automated parity suite (`test:parity`) diffing Django vs Node across all endpoints
- [ ] Autocannon / k6 load benchmark comparisons (Node equal or faster than Django)
- [ ] Chaos resilience validation (Mongo restart, Redis failure fallback, slow external APIs)
- [ ] Tenancy isolation security sweep (cross-tenant ID tampering returns 403/404)
- [ ] Dependency security audits clean (`pnpm audit`)

---

## 4. Test Scoreboard

| Module / Phase | Unit (P/F/S) | Integration (P/F/S) | Contract (P/F/S) | Parity (P/F/S) | E2E (P/F/S) | Coverage % | Lint / Typecheck |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 0 Baseline** | N/A | N/A | N/A | N/A | N/A | N/A | Clean |
| **Phase 1 Django Contract**| 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | N/A | Pending |

---

## 5. Decisions Log

| Decision ID | Topic | Options Considered | Choice | Rationale | Decided By |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEC-01** | Git Safety Baseline | Create tag vs branch-only | Create local tag `pre-mern-migration-2026-10-15` & branch `migration/mern` | Non-destructive restore point without remote push | User Instruction / Agent |
| **DEC-02** | File Storage on Render | Local filesystem vs Cloud S3 vs GridFS | S3 with GridFS fallback (Option A) | Local filesystem is ephemeral on Render. S3 or GridFS ensures durability without changing URLs | User Approved (Amendment Q1) |
| **DEC-03** | AI WebSocket Scoping | Broadcast to company group vs Requesting socket only | Scoped to requesting socket only | Fixes privacy/leak issue where all company members see assistant queries | User Approved (Amendment Q2) |
| **DEC-04** | Profit Confirmation Rule | Enforce 100% paid vs Allow confirmation on partial bills | PRESERVE: Allow confirmation on partial bills | Maintains compatibility with real-world customer workflows | User Approved (Amendment Q3) |
| **DEC-05** | Legacy Server-Rendered HTML Routes | Delete immediately vs Keep vs Track traffic | Mark `NEEDS-TRAFFIC-EVIDENCE` | Avoid breaking uncataloged external traffic until Render access logs are verified | User Approved (Amendment 3) |
| **DEC-06** | Password Hashing Strategy | Upgrade to bcrypt on login vs Preserve PBKDF2 | PRESERVE PBKDF2 (`REHASH_PASSWORDS_ON_LOGIN=false`) | Prevents locking users out of Django if rollback is needed | Master Prompt Rule 6 |

---

## 6. Quirks & Risks Mirror

- **QRK-01 / RSK-05**: Non-atomic invoice and SKU number generation in Django (`INV-YYYY-NNNNN`, `SKU-NNNNN`). Mitigated by additive `counters` collection in Node.
- **QRK-02**: Silent skip of deleted items during stock delta reconciliation. PRESERVED in Node.
- **QRK-03**: Profit confirmation allowed on partial/unpaid bills. PRESERVED in Node.
- **QRK-04 / RSK-01**: AI WebSocket broadcasts replies to entire company group. Scoped to requesting socket in Node.
- **QRK-05**: AI consumer reads `company_id` directly from token claim instead of live user DB record. Hardened in Node.
- **QRK-06 / RSK-07**: Ephemeral file storage on Render. Mitigated by S3/GridFS strategy.
- **QRK-07**: CSV upload re-generates all historical `FinancialSummary` records. PRESERVED in Node.
- **QRK-08 / RSK-10**: Naive UTC datetimes in Mongo queries. PRESERVED and standardized.

---

## 7. Open Questions Queue
*None currently blocking progress.*

---

## 8. Pending Inputs from User
- Render access logs for legacy HTML routes (`/dashboard/`, `/insights/`, `/upload/`, `/distribution/`, `/user/`).

---

## 9. Commit Log (Newest First)
- `(pending)` `docs: complete Phase 0 discovery deliverables and initialize PROGRESS.md`
- `9410c2a` `refactor: clean up legacy views and update routing for API-only backend`

---

## 10. How to Resume
1. Review `docs/migration/PROGRESS.md` to identify the current active phase and next step.
2. Confirm branch is `migration/mern`: `git status && git log -n 5 --oneline`.
3. Verify local MongoDB is running: `mongosh --eval "db.adminCommand('ping')"`.
4. Check test status: run the test command for the current phase.
5. Continue from the first unchecked item in the Migration Checklist.

---

## 11. Activity Log
- **2026-10-15 02:45 UTC**: Phase 0 discovery executed. Introspected local MongoDB database, audited all 48 API endpoints, analyzed WebSockets, reviewed business math and edge cases, generated all 8 required migration documents under `docs/migration/`.
- **2026-10-15 03:10 UTC**: Switched to Autonomous Continuation Mode for Phases 0.5-5. Initialized `PROGRESS.md`. Starting Phase 0.5.
