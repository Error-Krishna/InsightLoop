# InsightLoop Production Deployment Checklist

This runbook provides step-by-step instructions to deploy InsightLoop from `main` to Render (Backend API) and Vercel (Frontend Web SPA).

---

## 1. Quick Summary of Steps

1. Generate secrets locally with `openssl`.
2. Generate a Gmail App Password for contact form notifications.
3. Deploy the Render Blueprint from the `main` branch and fill in the required environment variables.
4. Deploy the frontend on Vercel and set the three `VITE_*` environment variables.
5. Add the Vercel domain to Authorized JavaScript Origins in the Google Cloud Console.
6. Run the automated smoke test script to verify all systems.

---

## 2. Secrets Generation (Run Locally)

Run this command twice in your terminal to create secure 32-byte hexadecimal strings:

```bash
openssl rand -hex 32
```

- **Run 1:** Use the output as your `JWT_SECRET`.
- **Run 2:** Use the output as your `METRICS_TOKEN`.

---

## 3. How to Make a Gmail App Password

InsightLoop uses standard SMTP with TLS to send email notifications when a user submits the public contact form.

1. Go to [Google Account Security](https://myaccount.google.com/security).
2. Ensure **2-Step Verification** is enabled on your account.
3. In the top search bar (or under 2-Step Verification), search for **App passwords**.
4. Enter an app name, for example: `InsightLoop Production`.
5. Click **Create**.
6. Google displays a 16-character code (e.g. `abcd efgh ijkl mnop`).
7. Copy the code without spaces. This is your `EMAIL_HOST_PASSWORD`.

---

## 4. Render Blueprint Deployment (Backend API)

1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Blueprint**.
3. Connect your repository: `Insightloop`.
4. Select the **`main`** branch.
5. Render detects `render-blueprint.yaml` and displays the `insightloop-api` web service.
6. Fill in the environment variables marked `sync: false` using the table below.
7. Click **Apply**. Render will run:
   - **Build Command:** `pnpm install --frozen-lockfile && pnpm --filter @insightloop/shared build && pnpm --filter @insightloop/api build`
   - **Start Command:** `node apps/api/dist/server.js`
   - **Health Check Path:** `/health`

### Render Environment Variables Table

| Variable Name | Required? | What to Put | Where to Get It |
|---|---|---|---|
| `MONGODB_URI` | **Required** | MongoDB Atlas connection string (e.g., `mongodb+srv://user:pass@cluster.mongodb.net/insightloop?retryWrites=true&w=majority`) | MongoDB Atlas -> Database -> Connect -> Drivers (Node.js) |
| `MONGODB_DB_NAME` | **Required** | Production database name (e.g. `insightloop`) | Name of your MongoDB database in Atlas |
| `JWT_SECRET` | **Required** | 64-char random hex string (min 32 chars) | Generated from `openssl rand -hex 32` |
| `METRICS_TOKEN` | **Required** | 64-char random hex string (secures `/metrics`) | Generated from `openssl rand -hex 32` |
| `CORS_ORIGIN` | **Required** | Your Vercel frontend URL: `https://<your-project>.vercel.app` | Vercel Project Dashboard |
| `FRONTEND_ORIGIN` | **Required** | Your Vercel frontend URL: `https://<your-project>.vercel.app` (used for `GET /` redirects) | Vercel Project Dashboard |
| `GOOGLE_CLIENT_ID` | **Required** | OAuth 2.0 Web Client ID | Google Cloud Console -> APIs & Services -> Credentials |
| `EMAIL_HOST_USER` | Optional | Your sender Gmail address (e.g. `notifications@insightloop.io`) | Your Google / Gmail account |
| `EMAIL_HOST_PASSWORD` | Optional | 16-character Google App Password | Generated from Google Account -> App Passwords |
| `REDIS_URL` | Optional | Redis connection string (e.g. `rediss://default:token@host:6379`) | Upstash Redis or Render Redis (in-memory fallback used if unset) |
| `S3_BUCKET_NAME` | Optional | AWS S3 Bucket name (leave blank if using GridFS) | AWS S3 Console |
| `AWS_REGION` | Optional | AWS Region (e.g. `us-east-1`) | AWS S3 Console |
| `AWS_ACCESS_KEY_ID` | Optional | AWS IAM Access Key | AWS IAM Console |
| `AWS_SECRET_ACCESS_KEY` | Optional | AWS IAM Secret Key | AWS IAM Console |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional | Meta WhatsApp Phone Number ID | Meta Developer Portal -> WhatsApp |
| `WHATSAPP_ACCESS_TOKEN` | Optional | Meta WhatsApp System User Access Token | Meta Developer Portal -> WhatsApp |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Optional | Meta WhatsApp Business Account ID | Meta Developer Portal -> WhatsApp |

*Note: Variables with preset defaults in `render-blueprint.yaml` (such as `NODE_ENV=production`, `PORT=10000`, `HOST=0.0.0.0`, `APP_TIME_ZONE=UTC`, `STORAGE_DRIVER=gridfs`, `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`, `EMAIL_USE_TLS=true`) are automatically applied.*

---

## 5. Vercel Deployment (Frontend Web SPA)

1. Log into your [Vercel Dashboard](https://vercel.com).
2. Import the `Insightloop` repository from GitHub on branch `main`.
3. Set **Framework Preset** to `Vite`.
4. Set **Root Directory** to `./`.
5. Monorepo build settings are pre-configured in `vercel.json` (do not override unless needed):
   - **Install Command**: `pnpm install --frozen-lockfile`
   - **Build Command**: `pnpm --filter @insightloop/shared build && pnpm --filter @insightloop/web build`
   - **Output Directory**: `apps/web/dist`
6. In **Environment Variables** (Project Settings -> Environment Variables), add the following three variables:

| Variable Name | Exact Format / Example | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `https://insightloop-api.onrender.com/api/v1` | Render API URL (HTTPS, MUST end in `/api/v1` because web API clients append endpoints like `/auth/refresh`) |
| `VITE_WS_BASE_URL` | `wss://insightloop-api.onrender.com` | Render WebSocket URL (WSS scheme, hostname only, NO trailing slash or path) |
| `VITE_GOOGLE_CLIENT_ID` | `572736622320-3mtp1g63p07t1karnjo4df2nt3s6kmko.apps.googleusercontent.com` | Google OAuth Client ID matching the backend |

7. Click **Deploy**.

---

## 6. Google Cloud Console: Authorized JavaScript Origins

Google Sign-In will fail with `redirect_uri_mismatch` or `origin_mismatch` if the production domain is not registered.

1. Open the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Click your OAuth 2.0 Client ID (under **OAuth 2.0 Client IDs**).
3. Scroll down to **Authorized JavaScript origins**.
4. Click **+ ADD URI**.
5. Enter your exact Vercel frontend URL:
   - Example: `https://insightloop.vercel.app`
   - *(Do NOT add a trailing slash)*
6. Click **Save** at the bottom of the page.

---

## 7. Post-Deployment Smoke Test

Once both Render and Vercel builds finish, run the automated zero-dependency smoke test from your local terminal:

```bash
node scripts/smoke_test.mjs https://insightloop-api.onrender.com https://insightloop.vercel.app
```

The script will verify:
- Health check (`GET /health`)
- Root redirect (`GET /` -> 302 to Vercel)
- CORS preflight headers
- Auth flow (signup throwaway user, login, token refresh)
- Resource operations (create worker, inventory item, bill + payment, verify `%PDF` binary header, verify dashboard overview)
- CSV upload & WebSocket connection (`/ws/dashboard/`)
- Contact form submission (`POST /contact`)
- Automatic teardown of all test data created

All checks should print `PASS` and exit with code `0`.

---

## 8. Rollback Procedures

### Rollback on Render (Backend)
1. Go to Render Dashboard -> Select `insightloop-api`.
2. Click the **Events** tab on the left menu.
3. Find the previous stable deploy.
4. Click the three dots menu on that deploy and select **Rollback to this deploy**.
5. Render will immediately bring up the previous container revision.

*(Canary Rollback Window: If you need to revert to the Django service during the 14-day canary window, refer to `docs/runbooks/canary_rollback.md` to point DNS or `VITE_API_BASE_URL` (ending in `/api/v1`) to the standby Django service).*

### Rollback on Vercel (Frontend)
1. Go to Vercel Dashboard -> Select `Insightloop` project.
2. Click **Deployments**.
3. Locate the previous working production deployment.
4. Click the three dots `...` on that deployment -> Select **Promote to Production**.
5. Vercel routes traffic to the previous deployment instantly (0-second switch).
