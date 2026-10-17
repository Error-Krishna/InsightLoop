# InsightLoop Django-to-Node Environment Variable Mapping Runbook

This runbook documents every configuration variable referenced in the legacy Django backend (`settings.py`, `os.getenv()` across all apps, and the historical `render.yaml`), alongside the corresponding Node.js Express variable, defaults in each stack, required production actions on Render, and alias compatibility.

---

## 1. Master Environment Variable Mapping Table

| Django Variable | Node Replacement | Django Default | Node Default | Must Set on Render? | Notes & Parity Guarantees |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DJANGO_SECRET_KEY` | `JWT_SECRET` | None (crashes if unset or placeholder) | None (validated by Zod schema) | **YES** | Set `JWT_SECRET` to the exact value of `DJANGO_SECRET_KEY` so existing user tokens remain valid. Node also accepts `DJANGO_SECRET_KEY` as fallback if `JWT_SECRET` is omitted. |
| `MONGODB_URI` | `MONGODB_URI` | `mongodb://localhost:27017/InsightLoop` | None (required) | **YES** | Production MongoDB Atlas connection URI. Rejects `_test` suffix in production. |
| `MONGODB_DB_NAME` | `MONGODB_DB_NAME` | `InsightLoop` | `InsightLoop` | Optional | Defaults to `InsightLoop`. If set on Render, keeps the same database. |
| `REDIS_URL` | `REDIS_URL` | `""` (in-memory channel layer) | `""` (in-memory rate limiting / events) | Optional | Redis connection string. If omitted, Node smoothly defaults to in-memory store. |
| `FRONTEND_ORIGIN` | `FRONTEND_ORIGIN` | `""` | `""` | **YES** | Vercel production frontend origin (e.g., `https://insightloop.vercel.app`). Node automatically appends this to allowed CORS origins and uses it for root `/` redirect. |
| `DJANGO_CORS_ALLOWED_ORIGINS` | `CORS_ORIGIN` | `""` | `""` | Optional | Comma-separated list of additional allowed CORS origins. Node accepts `DJANGO_CORS_ALLOWED_ORIGINS` as an alias if `CORS_ORIGIN` is not provided. |
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | `""` | `""` | **YES** (if Google auth enabled) | Public OAuth2 client ID used for validating Google ID tokens on login. Must match frontend `VITE_GOOGLE_CLIENT_ID`. |
| `GOOGLE_CLIENT_SECRET` | *(None / Obsolete)* | `""` | N/A | **NO** | Obsolete. Google ID token validation in Node verifies signatures via Google's `tokeninfo` or cert endpoints, requiring no client secret. |
| `GOOGLE_REDIRECT_URI` | *(None / Obsolete)* | `https://insightloop.onrender.com/auth/google/callback/` | N/A | **NO** | Obsolete. React frontend handles GIS flow directly in the browser. |
| `WHATSAPP_API_VERSION` | `WHATSAPP_API_VERSION` | `v21.0` | `v21.0` | Optional | Graph API version for Meta WhatsApp Cloud API. |
| `WHATSAPP_PHONE_NUMBER_ID` | `WHATSAPP_PHONE_NUMBER_ID` | `"REPLACE_WITH_PHONE_NUMBER_ID"` | `""` | Optional | Meta sender phone number ID. |
| `WHATSAPP_ACCESS_TOKEN` | `WHATSAPP_ACCESS_TOKEN` | `"REPLACE_WITH_ACCESS_TOKEN"` | `""` | Optional | System User access token from Meta Developer portal. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `WHATSAPP_BUSINESS_ACCOUNT_ID` | `"REPLACE_WITH_BUSINESS_ACCOUNT_ID"` | `""` | Optional | Meta WABA ID. |
| `WHATSAPP_BILL_TEMPLATE_NAME` | `WHATSAPP_BILL_TEMPLATE_NAME` | `bill_share` | `bill_share` | Optional | Pre-approved template name. |
| `WHATSAPP_BILL_TEMPLATE_LANGUAGE` | `WHATSAPP_BILL_TEMPLATE_LANGUAGE` | `en_US` | `en_US` | Optional | Template locale code. |
| `WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR` | `WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR` | `false` | `false` | Optional | Boolean flag indicating whether template body expects company name variable. |
| `WHATSAPP_PROVIDER` | `WHATSAPP_PROVIDER` | `"openwa"` if placeholder, else `"meta"` | `"openwa"` if placeholder, else `"meta"` | Optional | Provider selector (`meta` vs `openwa`). Node mirrors Django's automatic fallback when credentials are placeholders. |
| `OPENWA_BASE_URL` | `OPENWA_BASE_URL` | `http://localhost:2785` | `http://localhost:2785` | Optional | Base URL for self-hosted OpenWA WhatsApp bridge. |
| `OPENWA_API_KEY` | `OPENWA_API_KEY` | `""` | `""` | Optional | OpenWA authentication key. |
| `EMAIL_HOST` | `EMAIL_HOST` | `smtp.gmail.com` | `smtp.gmail.com` | Optional | SMTP host for contact messages. |
| `EMAIL_PORT` | `EMAIL_PORT` | `587` | `587` | Optional | SMTP port (STARTTLS). |
| `EMAIL_USE_TLS` | `EMAIL_USE_TLS` | `true` | `true` | Optional | Enables STARTTLS. |
| `EMAIL_HOST_USER` | `EMAIL_HOST_USER` | `""` | `""` | Optional | SMTP authentication username. |
| `EMAIL_HOST_PASSWORD` | `EMAIL_HOST_PASSWORD` | `""` | `""` | Optional | SMTP authentication password/app password. |
| `DEFAULT_FROM_EMAIL` | `DEFAULT_FROM_EMAIL` | `noreply@localhost` or user | `noreply@insightloop.io` | Optional | From address header for contact form notifications. |
| `ADMIN_EMAIL` | `ADMIN_EMAIL` | `DEFAULT_FROM_EMAIL` | `admin@insightloop.io` | Optional | Destination email address for inbound contact submissions. |
| `EMAIL_BACKEND` | *(None / Obsolete)* | `django.core.mail.backends.smtp.EmailBackend` | N/A | **NO** | Obsolete. Node uses `nodemailer` with built-in STARTTLS and auth. |
| `AWS_STORAGE_BUCKET_NAME` | `S3_BUCKET_NAME` | None | `""` | Optional | S3 Bucket name. Node accepts both `S3_BUCKET_NAME` and `AWS_STORAGE_BUCKET_NAME`. |
| `AWS_S3_REGION_NAME` | `AWS_REGION` | None | `ap-south-1` | Optional | S3 AWS Region. Node accepts both `AWS_REGION` and `AWS_S3_REGION_NAME`. |
| `AWS_ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` | None | `""` | Optional | AWS IAM access key ID for S3 uploads. |
| `AWS_SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` | None | `""` | Optional | AWS IAM secret access key for S3 uploads. |
| `STORAGE_DRIVER` | `STORAGE_DRIVER` | N/A | `gridfs` | Optional | Defaults to `gridfs` (MongoDB binary storage). Set to `s3` to enable AWS S3 storage. |
| `APP_TIME_ZONE` | `APP_TIME_ZONE` | N/A (Django used UTC) | `UTC` | Optional | Server reference timezone for date boundaries and aggregations. Defaults to `UTC` matching Django on Render. |
| `METRICS_TOKEN` | `METRICS_TOKEN` | N/A | None (required in prod) | **YES** | Shared secret token required in production to query `/health/detailed` and `/metrics`. Must be >= 16 characters. |
| `DJANGO_ALLOWED_HOSTS` | *(None / Not Needed)* | `127.0.0.1,localhost,...` | N/A | **NO** | Not needed in Node. Express handles requests bound to `0.0.0.0` or forwarded by Render reverse proxy. |
| `DJANGO_CSRF_TRUSTED_ORIGINS`| *(None / Not Needed)* | `https://insightloop.onrender.com` | N/A | **NO** | Not needed in Node. Node API uses stateless Bearer JWT auth for all endpoints. |
| `DJANGO_DEBUG` | `NODE_ENV` | `false` | `production` | **NO** | Node uses standard `NODE_ENV=production`. |
| `RENDER_EXTERNAL_HOSTNAME` | *(None / Render Internal)* | Injected by Render | N/A | **NO** | Render platform internal metadata. |
| `DISABLE_COLLECTSTATIC` | *(None / Obsolete)* | `0` | N/A | **NO** | Obsolete. Python static collection step eliminated. |
| `PYTHONPATH` | *(None / Obsolete)* | `/opt/render/project/src` | N/A | **NO** | Obsolete. Python runtime eliminated. |
| `GITHUB_*` / `LINKEDIN_*` | *(None / Obsolete)* | `""` | N/A | **NO** | Obsolete unused social auth stubs. |

---

## 2. Variables That MUST Be Set in Render Dashboard

When creating or updating the `insightloop-api` service on Render:

1. **`JWT_SECRET`**:
   - Copy the existing value from `DJANGO_SECRET_KEY`.
   - *Parity guarantee*: Node will verify existing JWT access/refresh tokens issued by Django without forcing users to re-login.
2. **`MONGODB_URI`**:
   - Copy the existing Atlas connection URI.
3. **`FRONTEND_ORIGIN`**:
   - Set to your Vercel URL (e.g. `https://insightloop.vercel.app`).
   - Automatically included in Node's CORS allowlist and root `/` redirect.
4. **`METRICS_TOKEN`**:
   - Generate a random 32-character secret string:
     ```bash
     openssl rand -hex 16
     ```
   - Used by uptime monitors or internal observability to query `/health/detailed` and `/metrics`.
5. **`GOOGLE_CLIENT_ID`** (if Google Sign-In is active):
   - Set to the same Google Client ID configured on Vercel.

---

## 3. Backward Compatibility Fallbacks in Node

To prevent operational accidents during migration, Node's environment parser (`apps/api/src/config/env.ts`) includes automated aliases:
- If `JWT_SECRET` is unset, Node reads `DJANGO_SECRET_KEY`.
- If `CORS_ORIGIN` is unset, Node reads `DJANGO_CORS_ALLOWED_ORIGINS`.
- If `S3_BUCKET_NAME` is unset, Node reads `AWS_STORAGE_BUCKET_NAME`.
- If `AWS_REGION` is unset, Node reads `AWS_S3_REGION_NAME`.
- `FRONTEND_ORIGIN` is dynamically injected into CORS allowed origins.
