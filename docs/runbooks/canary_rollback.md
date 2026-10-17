# Canary Deployment & 14-Day Rollback Runbook

## 1. Overview & Baseline Protection

Throughout the MERN migration, the legacy Python Django backend (`insightloop/`) is preserved byte-for-byte in an immutable state to guarantee instant, risk-free rollback during canary evaluation and the 14-day observation window.

### Non-Negotiable Safety Verification
Before initiating any deployment or rollback action, execute the baseline diff check:
```bash
git diff --stat pre-mern-migration-2026-10-15..HEAD -- insightloop/
```
**Required Output:** Zero diffs (completely empty output). If any diff appears, abort deployment immediately.

---

## 2. Canary Deployment Stages (Phase 6 & 7 Execution)

When Phase 6 and 7 are formally authorized, traffic routing between Django and Node will transition gradually via Cloudflare Workers / Reverse Proxy weighting:

| Stage | Node (MERN) Traffic | Django Traffic | Duration | Exit Criteria / Checks |
| :--- | :--- | :--- | :--- | :--- |
| **Stage 1 (Internal)** | 0% Public / 100% Team | 100% Public | 24 Hours | Internal team validation across all 5 critical flows. |
| **Stage 2 (Canary 10%)** | 10% | 90% | 48 Hours | Error rate < 0.1%, p95 latency < 150ms. |
| **Stage 3 (Canary 25%)** | 25% | 75% | 48 Hours | Zero tenant isolation issues, metrics parity verified. |
| **Stage 4 (Canary 50%)** | 50% | 50% | 72 Hours | Dual-stack database reads/writes verified clean. |
| **Stage 5 (100% Cutover)**| 100% | 0% (Standby) | 14 Days | Standby Django instance kept alive on port 8000. |

---

## 3. Rollback Triggers & Automated Circuit Breakers

A rollback to Django must be initiated immediately if any of the following occur during the canary phase:
1. **Error Rate Spike**: HTTP 5xx responses exceed 1% over a 5-minute rolling window.
2. **Data Model / Schema Drift**: MongoEngine document loads on Django raise `FieldDoesNotExist` or validation exceptions.
3. **Data Loss / Calculation Discrepancy**: Grand totals or ledger balances diverge between stacks.
4. **Severe Latency Degradation**: API p99 response time exceeds 500ms.
5. **Security / Tenancy Breach**: Any cross-tenant data leakage detected.

---

## 4. Emergency Rollback Execution (Time to Complete: < 60 Seconds)

### Step 1: Revert Traffic Routing to Django
Execute the traffic switch at the Cloudflare / Load Balancer level:
- In Cloudflare Dashboard / API: Set `ROUTE_WEIGHT_NODE=0`, `ROUTE_WEIGHT_DJANGO=100`.
- Or update DNS CNAME to point directly to the Django Render service.
- Or if the Vercel frontend connects directly: update `VITE_API_BASE_URL` in the Vercel dashboard to `https://<django-render-url>/api/v1` (MUST end in `/api/v1`) and trigger a redeploy.

### Step 2: Flush Web Browser Sessions
If JWT signing secrets differ between deployments, clear local tokens via client redirect:
```bash
# Verify Django health
curl -s https://api.insightloop.com/api/v1/health/ | jq .
```

### Step 3: Verify Django Database Compatibility
Verify that documents written by Node during the canary window can be read and edited by Django:
```bash
.venv/bin/python scripts/test_dual_stack.mjs
```

### Step 4: Post-Rollback Postmortem
1. Extract Node API error logs from the incident window.
2. File an incident report in `docs/migration/incident_reports/`.
3. Reproduce the failure in an isolated test suite before any subsequent canary attempt.
