# InsightLoop Migration Report: Django + React → MERN (TypeScript)

**Date**: 2026-10-17  
**Branch**: `migration/mern` (STAGING-CANDIDATE)  
**Safety Base Tag**: `pre-mern-migration-2026-10-15`  
**Status**: **PHASE 5.9 COMPLETE (VERIFIED) [STAGING-CANDIDATE]**  
*(Phases 6, 7, and 8 remain strictly locked. Staging/production deployment not initiated. Removal branch `chore/remove-python` remains unmerged until 14-day canary window completes.)*

---

## 1. Executive Summary

The migration of the InsightLoop SaaS backend and web application from Python/Django/MongoEngine to a high-performance, strongly-typed MERN architecture (TypeScript Turborepo monorepo: Node.js/Express + React 19 + TypeScript + MongoDB + Redis/WebSockets) has reached verified **STAGING-CANDIDATE** status.

### Core Non-Negotiable Guarantees Verified:
1. **Python Django Byte-for-Byte Baseline Integrity**:
   - `git diff --stat pre-mern-migration-2026-10-15..HEAD -- insightloop/` is **0 bytes / 0 lines modified**. Not a single character in the legacy Python Django backend was modified during migration on `migration/mern`.
2. **True Dual-Stack Behavioral Parity (71/71 Checks)**:
   - Automated true parity suite (`scripts/run_true_dual_parity.mjs`) executed 71 identical checks against real Django (port 8000) and real Node.js (port 4000) across isolated databases.
   - 20 GET, 5 PUT, 39 POST, 3 DELETE, 1 DB_QUERY, 3 WS checks across 11 functional domains with 0 unauthorized differences.
   - Evidence: [`docs/migration/evidence/parity_django_vs_node.txt`](evidence/parity_django_vs_node.txt).
3. **Invoice PDF & WhatsApp Parity**:
   - Layout and text parity verified across 4 bills (pakka standard, kacha no-logo, pakka multipage 28 items, kacha multipage 25 items) against real WeasyPrint output; diff files show whitespace and column-alignment differences only (all words and numbers identical). Offline test in `test/pdf_parity.test.ts`. WhatsApp mock delivery tested in `test/whatsapp_mock.test.ts`.
   - Evidence: [`docs/migration/evidence/pdf_parity/`](evidence/pdf_parity/).
4. **Fair Multi-Run Load Benchmark (Identical Indexes, 0 Cache)**:
   - Benchmark executed across 14 list, dashboard, and insights endpoints with identical compound indexes and 0 response caching.
   - Node API achieved 0.00% error rate with p50 latencies between 2.4ms and 22.2ms (Django: 11.0ms to 206.2ms). Peak RSS measured at 133 MB for Node vs 108.7 MB for Django.
   - Evidence: [`docs/migration/evidence/C3_load_benchmark.txt`](evidence/C3_load_benchmark.txt).
5. **Strict Per-File Branch Coverage Targets Met**:
   - `scripts/check_branch_coverage.mjs` enforces $\ge 90\%$ for bills, workers, inventory, auth, profit, and stock, and $\ge 85\%$ elsewhere.
   - All files meet required targets; monitored branch coverage stands at **89.3% (2,216 / 2,481 branches)**.
   - Raw Stryker mutation testing scores: `math.ts` 94.61% raw, `bills.service.ts` 59.26% raw (365 categorized survivors), `workers.service.ts` 55.83% raw (91 survivors), `inventory.service.ts` 15.27% raw (283 survivors).
   - Evidence: [`docs/migration/evidence/C2_coverage_mutation.txt`](evidence/C2_coverage_mutation.txt).
6. **Feature & Asset Parity Ledger Honesty**:
   - 176 total assets cataloged (all Python files, HTML templates, static files, requirements packages, deployment files, environment variables, management commands).
   - MISSING: None. Every ported row cites a verified test file and test name.
   - Evidence: [`docs/migration/python-feature-ledger.md`](python-feature-ledger.md).
7. **Python-Free Removal Branch Gate (`chore/remove-python`)**:
   - Verified in clean, offline environment with 0 `.py` files, 0 requirements files, 0 Python CI steps.
   - All API tests (304/304), web tests (107/107), Playwright E2E flows (11/11), and Docker builds (`insightloop-api:gate`, `insightloop-web:gate`) pass cleanly.
   - Branch remains unmerged until 14-day canary window completes without rollbacks.
   - Evidence: [`docs/migration/evidence/python_free_gate.txt`](evidence/python_free_gate.txt), [`docs/runbooks/python_removal_merge.md`](../runbooks/python_removal_merge.md).

---

## 2. Parity & Verification Table

| Verification Domain | Target Requirement | Measured Result | Status | Evidence File |
| :--- | :--- | :--- | :--- | :--- |
| **Python Byte Safety** | 0 diffs in `insightloop/` on `migration/mern` | 0 bytes / 0 lines modified | **PASS** | `git diff pre-mern-migration-2026-10-15..HEAD -- insightloop/` |
| **Dual-Stack Parity** | 71 checks across 11 functional domains | 71 passing, 0 diffs | **PASS** | [`evidence/parity_django_vs_node.txt`](evidence/parity_django_vs_node.txt) |
| **PDF Text Parity** | 4 bills (WeasyPrint vs PDFKit) | Whitespace/column diffs only (identical words/numbers) | **PASS** | [`evidence/pdf_parity/`](evidence/pdf_parity/) |
| **Per-File Branch Coverage** | $\ge 90\%$ critical services/repos, $\ge 85\%$ others | Monitored 89.3%, all targets met | **PASS** | [`evidence/C2_coverage_mutation.txt`](evidence/C2_coverage_mutation.txt) |
| **Playwright E2E Suite** | 11 browser enterprise flows | 11/11 passed in 17.0s | **PASS** | `pnpm --filter @insightloop/web test:e2e` |
| **Feature Ledger** | 176 cataloged assets, exact test citations | 0 errors, MISSING: None | **PASS** | [`python-feature-ledger.md`](python-feature-ledger.md) |
| **Docker Build** | API & Web multi-stage alpine images | Clean builds | **PASS** | `docker build` |
| **Python-Free Gate** | 0 `.py` files on `chore/remove-python` | Verified offline without Python | **PASS** | [`evidence/python_free_gate.txt`](evidence/python_free_gate.txt) |

---

## 3. Next Steps & Canary Operational Policy
1. Deploy `migration/mern` as **STAGING-CANDIDATE** to staging environment for manual exploratory testing.
2. Maintain Django active in `insightloop/` on `migration/mern` to support instant traffic redirection if canary rollbacks occur.
3. Observe a mandatory **14-day zero-rollback soak period** in production before merging `chore/remove-python`.
