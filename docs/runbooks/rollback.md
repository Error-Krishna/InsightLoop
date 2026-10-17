# Production Rollback Runbook (Render & Vercel)

This runbook specifies the emergency rollback procedures for InsightLoop's pure Node/TypeScript production environment.

InsightLoop runs as:
- **Backend API**: Node.js/Express service hosted on **Render** (`https://insightloop.onrender.com`).
- **Frontend SPA**: React 19 application hosted on **Vercel** (`https://insightloop.vercel.app`).
- **Database**: MongoDB Atlas cluster (`InsightLoop`).

All rollbacks are atomic, single-click operations within the Render and Vercel hosting dashboards, with zero Python or Django dependencies.

---

## 1. Rollback Triggers

Initiate a rollback immediately if any of the following conditions occur after a deployment:
1. **HTTP 5xx Spike**: Error rate exceeds 0.5% over a 3-minute rolling window.
2. **Crash Loop / Boot Refusal**: Service fails health checks on `/health` and fails to start.
3. **Database Write Failure**: MongoDB operations fail due to schema validation or connection exhaustion.
4. **Severe Latency Degradation**: p95 response latency on core API routes exceeds 300ms.
5. **Frontend Runtime Regression**: Critical user flows (login, bills, dashboard, PDF export) throw unhandled client exceptions.

---

## 2. Backend Rollback Procedure (Render)

Time to complete: **< 60 seconds**.

### Step 1: Open Render Dashboard
1. Navigate to [dashboard.render.com](https://dashboard.render.com).
2. Select the `insightloop-api` web service.

### Step 2: Roll Back to Previous Deploy
1. Click on the **Events** tab in the service navigation.
2. Identify the last known good deployment (marked **Deploy live** prior to current deploy).
3. Click the three dots (`...`) next to that deployment and select **Rollback to this deploy**.
4. Render immediately switches traffic to the container image of the previous deploy without rebuilding.

### Step 3: Verification
Verify service health:
```bash
curl -I https://insightloop.onrender.com/health
# Expected: HTTP/2 200 with {"status":"ok","db":"connected"}
```

---

## 3. Frontend Rollback Procedure (Vercel)

Time to complete: **< 15 seconds**.

### Step 1: Open Vercel Dashboard
1. Navigate to [vercel.com/dashboard](https://vercel.com/dashboard).
2. Select the `insightloop` project.

### Step 2: Instant Rollback
1. Click on the **Deployments** tab.
2. Locate the previous production deployment that was healthy.
3. Click the three dots (`...`) and select **Instant Rollback** (or **Promote to Production**).
4. Vercel edges immediately route all incoming DNS traffic to the previous deployment bundle.

### Step 3: Verification
Open `https://insightloop.vercel.app` in an incognito window and verify that login and dashboard screens render correctly.

---

## 4. Post-Rollback Diagnostics

1. Inspect Render logs: Download the build and runtime logs for the failed deployment.
2. Inspect Prometheus metrics via `GET /metrics` with `x-metrics-token`.
3. File an incident report detailing root cause, reproduction steps, and required fix before re-deploying to `main`.
