# InsightLoop

InsightLoop is a modern, high-performance SaaS platform built for small-to-medium manufacturers. It provides real-time operational visibility across inventory, worker material assignments and wages, automated invoicing (with custom PDFKit PDF generation and WhatsApp bill sharing), dashboard analytics with live WebSocket updates, AI assistant query parsing, and CSV data ingestion.

The project is structured as a TypeScript Turborepo monorepo:
- **`apps/api`**: Node.js & Express API (native MongoDB v6 driver, Zod validation, Pino logging, WebSockets, Nodemailer, PDFKit).
- **`apps/web`**: React 19 Single Page Application (Vite 6, Tailwind CSS, Recharts, Lucide React, Sonner).
- **`packages/shared`**: Shared TypeScript business logic and math calculations (grand total, wage balances, transportation costs, profit margins).
- **`docs/`**: Operational runbooks and migration history.

---

## 1. Quick Start (Local Development)

### Prerequisites
- **Node.js**: v22.x or later (`.nvmrc` specifies `22`)
- **pnpm**: v11.x (managed via Corepack: `corepack enable`)
- **MongoDB**: MongoDB 7.0+ instance running locally on `127.0.0.1:27017` (or via Docker Compose)
- **Redis**: Redis 7.x (optional; defaults to in-memory store if omitted)

### Setup & Installation
```bash
# 1. Enable pnpm via Corepack
corepack enable
pnpm --version

# 2. Install workspace dependencies
pnpm install --frozen-lockfile

# 3. Start local MongoDB & Redis via Docker Compose
docker compose up -d

# 4. Seed development database
pnpm tsx scripts/seed.ts mongodb://localhost:27017/InsightLoop_dev

# 5. Build all packages
pnpm build

# 6. Start development servers (API on http://localhost:4000, Web on http://localhost:5173)
pnpm dev
```

---

## 2. Running Tests & Quality Gates

InsightLoop maintains a comprehensive automated testing pipeline:

```bash
# Run all workspace test suites (API unit/integration + Web component tests)
pnpm test

# Run API test suite with code coverage
pnpm --filter @insightloop/api run test:coverage

# Run TypeScript typechecking across all workspace packages
pnpm typecheck

# Run ESLint across all workspace packages
pnpm lint

# Run offline regression safety nets (Schema, Negative Fixtures, Snapshots, PDF parity)
pnpm --filter @insightloop/api test test/schema_parity.test.ts
pnpm --filter @insightloop/api test test/negative_fixtures.test.ts
pnpm --filter @insightloop/api test test/snapshot_parity.test.ts
pnpm --filter @insightloop/api test test/pdf_parity.test.ts

# Run contract parity suite (assert mode)
pnpm test:contracts

# Run architectural wiring & silent-error gates
node scripts/check_wiring.mjs
node scripts/check_silent_errors.mjs
node scripts/check_citations.mjs
```

---

## 3. Production Deployment

### Architecture & Live Hosting
- **Backend API**: Deployed as a web service on **Render** ([https://insightloop.onrender.com](https://insightloop.onrender.com)) backed by **MongoDB Atlas**.
- **Frontend SPA**: Deployed as an edge-cached static application on **Vercel** ([https://insightloop.vercel.app](https://insightloop.vercel.app)).

### Render Blueprint Deployment
The backend API is defined in `render-blueprint.yaml`. To deploy:
1. Connect this repo to Render Blueprint.
2. Select branch `main`.
3. Provide the required environment variables.

### Production Environment Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | **YES** | Set to `production`. |
| `PORT` | **YES** | Injected by Render (defaults to `4000`). |
| `MONGODB_URI` | **YES** | Production MongoDB Atlas connection URI. |
| `MONGODB_DB_NAME` | **YES** | Database name (e.g. `InsightLoop`). |
| `JWT_SECRET` | **YES** | Min 32-character HMAC secret for JWT signing and verification. |
| `CORS_ORIGIN` | **YES** | Allowed CORS origins (e.g. `https://insightloop.vercel.app`). |
| `FRONTEND_ORIGIN` | **YES** | Public frontend URL. Automatically added to CORS and `/` redirect. |
| `GOOGLE_CLIENT_ID`| **YES** | Google OAuth2 Client ID for Google Sign-In. |
| `METRICS_TOKEN` | **YES** | Shared secret token required to query `/health/detailed` and `/metrics`. |
| `APP_TIME_ZONE` | Optional | Server timezone reference (defaults to `UTC`). |
| `STORAGE_DRIVER` | Optional | Storage provider: `gridfs` (default) or `s3`. |
| `EMAIL_HOST` | Optional | SMTP host for contact messages (`smtp.gmail.com`). |
| `EMAIL_PORT` | Optional | SMTP port (`587`). |
| `EMAIL_USE_TLS` | Optional | SMTP STARTTLS toggle (`true`). |
| `EMAIL_HOST_USER` | Optional | SMTP username / Gmail account. |
| `EMAIL_HOST_PASSWORD` | Optional | SMTP app password. |
| `WHATSAPP_ENABLED` | Optional | Auto-computed: `true` if Meta credentials provided. |
| `WHATSAPP_PROVIDER` | Optional | `meta` (default) or `openwa`. |

---

## 4. Runbooks & Documentation

Operational runbooks and architecture documentation are located in [`docs/runbooks/`](file:///Users/krishnagoyal/Development/personal%20projects/Insightloop/docs/runbooks/):
- **Deployment Checklist**: [`docs/runbooks/deploy_checklist.md`](file:///Users/krishnagoyal/Development/personal%20projects/Insightloop/docs/runbooks/deploy_checklist.md)
- **Environment Specification**: [`docs/runbooks/env_mapping.md`](file:///Users/krishnagoyal/Development/personal%20projects/Insightloop/docs/runbooks/env_mapping.md)
- **How It Runs Now**: [`docs/runbooks/how_it_runs_now.md`](file:///Users/krishnagoyal/Development/personal%20projects/Insightloop/docs/runbooks/how_it_runs_now.md)
- **Rollback Runbook**: [`docs/runbooks/rollback.md`](file:///Users/krishnagoyal/Development/personal%20projects/Insightloop/docs/runbooks/rollback.md)
- **Observability**: [`docs/runbooks/observability.md`](file:///Users/krishnagoyal/Development/personal%20projects/Insightloop/docs/runbooks/observability.md)
- **Secret Rotation**: [`docs/runbooks/secret_rotation.md`](file:///Users/krishnagoyal/Development/personal%20projects/Insightloop/docs/runbooks/secret_rotation.md)
- **Migration History**: [`docs/MIGRATION_HISTORY.md`](file:///Users/krishnagoyal/Development/personal%20projects/Insightloop/docs/MIGRATION_HISTORY.md)
