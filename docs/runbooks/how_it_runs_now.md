# How InsightLoop Runs Now (Post-Migration Reference)

## 1. Overview & Architecture

InsightLoop runs as a modern, decoupled TypeScript/Node stack (MERN). All runtime dependencies are pure Node.js and TypeScript.

```mermaid
flowchart LR
    User[Client Browser]
    Vercel[Vercel: Vite SPA<br/>apps/web]
    Render[Render: Node 22 API<br/>apps/api]
    Atlas[(MongoDB Atlas<br/>Database: InsightLoop)]

    User -->|HTTPS UI| Vercel
    User -->|REST API /api/v1| Render
    User -->|WebSocket /ws/dashboard/| Render
    Render -->|MongoDB Driver 6.x| Atlas
```

---

## 2. Service Deployments

### A. Backend API (Render)
- **Host / URL**: `https://insightloop.onrender.com` (Render Web Service `insightloop-api`)
- **Runtime**: Node.js 22 (ESM)
- **Framework**: Express 4, native `mongodb` driver (v6), Zod, Pino structured logging, `ws` (WebSockets), `compression` (gzip), `pdfkit`
- **Instance Specification**: Free plan (0.1 CPU core, 512 MB RAM, Region: Oregon, `us-west-1`)
- **Build Command**:
  ```bash
  pnpm install --frozen-lockfile && pnpm --filter @insightloop/shared build && pnpm --filter @insightloop/api build
  ```
- **Start Command**:
  ```bash
  node apps/api/dist/server.js
  ```
- **Health Check Path**: `/health` (returns `{"status":"ok","service":"InsightLoop Node API"}`)
- **Metrics Endpoint**: `/metrics` (Prometheus text format, protected by Bearer token via `METRICS_TOKEN`)

### B. Frontend SPA (Vercel)
- **Host / URL**: `https://insightloop.vercel.app` (Vercel Project)
- **Framework Preset**: Vite / React 18
- **Root Directory**: `./` (monorepo root)
- **Output Directory**: `apps/web/dist`
- **Install Command**: `pnpm install --frozen-lockfile`
- **Build Command**:
  ```bash
  pnpm --filter @insightloop/shared build && pnpm --filter @insightloop/web build
  ```

### C. Database (MongoDB Atlas)
- **Cluster**: MongoDB Atlas Shared/Dedicated tier
- **Database Name**: `InsightLoop` (canonical casing preserved)
- **Data Compatibility**:
  - All existing documents (Bills, Workers, PayRecords, MaterialAssignments, InventoryItems, Users) retain exact BSON types.
  - Password hashes use PBKDF2 SHA-256 scheme (`pbkdf2_sha256$600000$<salt>$<hash>`). Node hashes and verifies against this standard natively using Node `crypto.pbkdf2Sync` with 600,000 iterations.
  - Indexing: Additive compound indexes are ensured automatically on application boot in `apps/api/src/db/mongo.ts:ensureIndexes`.

---

## 3. Environment Variables Reference

### Backend (Render Web Service)

| Variable | Required? | Example / Value | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Enables production mode and caches validated environment schema. |
| `PORT` | Yes | `10000` | Port for Express HTTP and WebSocket server. |
| `HOST` | Yes | `0.0.0.0` | Bind host address. |
| `MONGODB_URI` | Yes | `mongodb+srv://user:pass@cluster.mongodb.net/InsightLoop?retryWrites=true&w=majority` | Atlas connection string. |
| `MONGODB_DB_NAME` | Yes | `InsightLoop` | Database name (production must not end with `_test`). |
| `JWT_SECRET` | Yes | `64-character-hex-string` | Secret for signing HS256 access and refresh tokens. |
| `METRICS_TOKEN` | Yes | `64-character-hex-string` | Bearer token securing `GET /metrics`. |
| `CORS_ORIGIN` | Yes | `https://insightloop.vercel.app` | Allowed frontend origin for CORS preflight and requests. |
| `FRONTEND_ORIGIN`| Yes | `https://insightloop.vercel.app` | Destination URL for `GET /` root redirect. |
| `GOOGLE_CLIENT_ID`| Yes| `5727...apps.googleusercontent.com` | OAuth 2.0 Web Client ID matching Google Cloud console. |
| `APP_TIME_ZONE` | No | `UTC` (default) | Application timezone. |
| `STORAGE_DRIVER`| No | `gridfs` (default) | Media storage driver (`gridfs` or `s3`). |
| `EMAIL_HOST` | No | `smtp.gmail.com` | Contact form notification SMTP host. |
| `EMAIL_PORT` | No | `587` | SMTP port. |
| `EMAIL_HOST_USER`| No | `notifications@insightloop.io` | SMTP username. |
| `EMAIL_HOST_PASSWORD`| No | `16-character-app-password` | Gmail App Password for SMTP authentication. |
| `EMAIL_USE_TLS` | No | `true` | Enable STARTTLS for email delivery. |
| `REDIS_URL` | No | `rediss://...` | Optional Redis URL for pub/sub (falls back to local memory). |

### Frontend (Vercel Project)

| Variable | Required? | Exact Example | Note / Constraints |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes | `https://insightloop.onrender.com/api/v1` | **CRITICAL**: Must end with `/api/v1` (client routes append endpoints like `/auth/refresh` or `/dashboard/overview`). |
| `VITE_WS_BASE_URL` | Yes | `wss://insightloop.onrender.com` | **CRITICAL**: Must use `wss://` protocol with hostname only, no trailing slash or subpath. |
| `VITE_GOOGLE_CLIENT_ID`| Yes | `5727...apps.googleusercontent.com` | Must match backend `GOOGLE_CLIENT_ID` and Authorized JavaScript Origins. |

---

## 4. Rollback Procedures

### A. Instant Platform Rollback (Zero Downtime)
If an application bug is detected in production:
1. **Render (Backend)**:
   - Navigate to [Render Dashboard](https://dashboard.render.com) -> Service `insightloop-api` -> **Events**.
   - Locate the last known good deploy.
   - Click the three dots `...` and choose **Rollback to this deploy**.
2. **Vercel (Frontend)**:
   - Navigate to [Vercel Dashboard](https://vercel.com) -> Project `Insightloop` -> **Deployments**.
   - Select the last stable deployment.
   - Click `...` -> **Promote to Production** (traffic switches instantly).

### B. Historical Codebase Restoration
The complete original application state prior to migration is preserved byte-for-byte in git tag `pre-mern-migration-2026-10-15` (commit `9410c2a33f6fef2ceed8a07843cfb52f7a04be71`). See [Migration History](../MIGRATION_HISTORY.md) for full restoration commands and safety tag verification.

---

## 5. Verification & Health Monitoring

To verify service health from any terminal:
```bash
# Public health check
curl -s https://insightloop.onrender.com/health | jq .

# Root redirect check
curl -I https://insightloop.onrender.com/

# Automated local/remote smoke test (16-step end-to-end check)
node scripts/smoke_test.mjs https://insightloop.onrender.com https://insightloop.vercel.app
```
