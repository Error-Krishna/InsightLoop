# Staging Deployment Runbook & Data-Safety Checklist

## 1. Scope & Purpose
This runbook defines the operational procedure for deploying InsightLoop MERN services to the Staging environment (`onrender.com` / `vercel.app`) with strict data-safety guards, additive-only schema evolution, and zero-downtime traffic verification.

---

## 2. Architecture Overview
| Layer | Service | Provider | Target / URL |
|---|---|---|---|
| **Frontend CDN** | React 19 SPA (`@insightloop/web`) | Vercel / Render Static | `https://insightloop-web.onrender.com` |
| **Backend API** | Node.js 22 LTS API (`@insightloop/api`) | Render Web Service | `https://insightloop-api.onrender.com` |
| **Primary Database** | MongoDB 6.0+ Multi-Tenant Replica Set | MongoDB Atlas (Staging) | Staging Replica Set cluster |
| **Blob Storage** | GridFS (Primary) + S3 (Archive) | MongoDB GridFS / AWS S3 | Encrypted bucket `insightloop-staging-media` |
| **Cache & Pub/Sub** | Redis 7.2 | Upstash / Render Redis | Redis cluster |

---

## 3. Data-Safety Checklist (Pre-Deployment Mandatory Gates)

Every deployment to staging or production MUST complete and sign off on each item in this checklist:

### A. Point-in-Time (PIT) Backup Verification
- [ ] Run automated snapshot on MongoDB Atlas:
  ```bash
  mongodump --uri="$MONGODB_STAGING_URI" --archive="staging_backup_$(date +%Y%m%d_%H%M%S).gz" --gzip
  ```
- [ ] Verify backup archive integrity:
  ```bash
  gzip -t staging_backup_*.gz && echo "Backup archive verified."
  ```
- [ ] Confirm restore dry-run target exists in isolated staging sandbox.

### B. Additive-Only Index Migration
- [ ] **Hard Rule**: No destructive index commands (`dropIndex`, `dropIndexes`) may be executed in automated scripts or migration steps.
- [ ] Execute the verified additive index runner:
  ```bash
  node scripts/apply_indexes_additive.mjs
  ```
- [ ] Verify that all 18 core indexes across `user`, `company`, `bills`, `inventory_items`, `warehouses`, `workers`, `assignments`, `pay_records`, and `business_data` are confirmed without errors.

### C. Legacy HTML Routes Traffic Evidence Audit
The Django monolithic codebase historically exposed server-rendered Django template HTML views. In Phase 5.7b, all user flows are migrated to the React SPA. However, to guarantee zero customer disruption, no legacy route will be deleted or altered without verified traffic logs:

| Legacy Route | Template Path | Status | Migration Action |
|---|---|---|---|
| `/dashboard/` | `insightloop/templates/dashboard/Dashboard.html` | `NEEDS-TRAFFIC-EVIDENCE` | Do not remove; monitor NGINX access logs for 30 consecutive days of 0 hits. |
| `/distribution/` | `insightloop/templates/workers/MaterialDistribution.html` | `NEEDS-TRAFFIC-EVIDENCE` | Audit legacy sessions before deprecation. |
| `/distribution/manage-workers/` | `insightloop/templates/workers/ManageWorkers.html` | `NEEDS-TRAFFIC-EVIDENCE` | Audit legacy sessions before deprecation. |
| `/insights/` | `insightloop/templates/insights/Insights.html` | `NEEDS-TRAFFIC-EVIDENCE` | Audit legacy sessions before deprecation. |
| `/upload/` | `insightloop/templates/upload/Upload.html` | `NEEDS-TRAFFIC-EVIDENCE` | Audit legacy sessions before deprecation. |
| `/aiexport/` | `insightloop/templates/AIExport/Export&AI.html` | `NEEDS-TRAFFIC-EVIDENCE` | Audit legacy sessions before deprecation. |
| `/user/profile/` | `insightloop/templates/misc/profile.html` | `NEEDS-TRAFFIC-EVIDENCE` | Audit legacy sessions before deprecation. |
| `/user/settings/` | `insightloop/templates/misc/settings.html` | `NEEDS-TRAFFIC-EVIDENCE` | Audit legacy sessions before deprecation. |

---

## 4. Staging Deployment Execution Steps

### Step 1: Pre-Flight Configuration Audit
Verify that `render-blueprint.yaml` matches `.env.example` exactly:
```bash
node scripts/check_render_env_parity.mjs
```
*Expected output*: `[ENV-PARITY] SUCCESS: All 28 environment variables match exactly!`

### Step 2: Verification of Vercel / Static CDN Routing
Confirm `vercel.json` SPA rewrite rules and environment names:
```bash
cat apps/web/vercel.json
```
Ensure rewrites route `/(.*)` to `/index.html` and only reference env variable names (`@vite_api_url`, etc.) without baking sensitive secrets into client assets.

### Step 3: Trigger Blueprint Deployment on Render
Deploy via Render Git sync or CLI:
```bash
git push origin migration/mern
```

### Step 4: Additive Index Execution
Immediately after the API container is provisioned:
```bash
node scripts/apply_indexes_additive.mjs
```

---

## 5. Post-Deployment Smoke & Health Validation

Run the following checks against the live staging endpoint:

1. **Liveness & Readiness**:
   ```bash
   curl -f -s https://insightloop-api.onrender.com/health/live
   curl -f -s https://insightloop-api.onrender.com/health/ready
   ```
2. **Deep Observability Metrics**:
   ```bash
   curl -f -s https://insightloop-api.onrender.com/health
   ```
   Verify database connectivity status is `"ok"` and storage driver reports `"gridfs"` or `"s3"`.
3. **Playwright E2E Validation Against Staging**:
   ```bash
   WEB_BASE_URL="https://insightloop-web.onrender.com" BACKEND_URL="https://insightloop-api.onrender.com" pnpm --filter @insightloop/web test:e2e
   ```

---

## 6. Rollback Protocol
If any of the following occur within 60 minutes of staging deployment:
- HTTP 5xx error rate > 0.1%
- Endpoint p95 latency > 250ms
- WebSocket connection drop rate > 1%

**Immediate Actions**:
1. Re-route DNS / CDN traffic back to the standby Python Django service.
2. The MongoDB database remains 100% compatible and unharmed because all indexes applied were additive-only and document shapes adhere to the verified Django schema contracts.
