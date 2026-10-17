# Staging Deployment Runbook & Data-Safety Checklist

## 1. Scope & Purpose
This runbook defines the operational procedure for deploying InsightLoop MERN services to the Staging environment (`onrender.com` / `vercel.app`) with strict data-safety guards, additive-only schema evolution, and zero-downtime traffic verification.

---

## 2. Architecture Overview
| Layer | Service | Provider | Target / URL |
|---|---|---|---|
| **Frontend CDN** | React 19 SPA (`@insightloop/web`) | Vercel | `https://insightloop.vercel.app` |
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

### C. Single Page Application Route Audit
All user flows are fully handled by the React SPA (`apps/web`) routing directly to Express API endpoints (`apps/api`).
All client routes are served by Vercel rewrites directly to `index.html`.


---

## 4. Staging Deployment Execution Steps

### Step 1: Pre-Flight Configuration Audit
Verify that `render-blueprint.yaml` matches `.env.example` exactly:
```bash
node scripts/check_render_env_parity.mjs
```
*Expected output*: `[ENV-PARITY] SUCCESS: All 28 environment variables match exactly!`

### Step 2: Configure Vercel Frontend Environment Variables
In the Vercel dashboard (Project Settings -> Environment Variables), define EXACTLY the following three variables for the Production and Preview environments:

| Variable | Staging / Production Value | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://insightloop-api.onrender.com/api/v1` | Base URL for REST API requests |
| `VITE_WS_BASE_URL` | `wss://insightloop-api.onrender.com` | Base URL for WebSocket connections |
| `VITE_GOOGLE_CLIENT_ID` | `572736622320-3mtp1g63p07t1karnjo4df2nt3s6kmko.apps.googleusercontent.com` | Google Identity Services OAuth Client ID |

> [!IMPORTANT]
> The legacy variable `VITE_API_URL` has been completely eliminated from the codebase. Do NOT set `VITE_API_URL` in Vercel. All frontend API and WebSocket URL constructions strictly consume `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`.

Verify `apps/web/vercel.json` SPA rewrite rules:
```bash
cat apps/web/vercel.json
```
Ensure rewrites route `/(.*)` to `/index.html`.

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
1. Roll back the Render web service to the previous deployment via Render Dashboard ("Rollback to this deploy").
2. Roll back the Vercel frontend to the previous deployment via Vercel Deployments ("Promote to Production").
3. See [Rollback Runbook](./rollback.md) for full procedures and verification checklist.
