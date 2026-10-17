# Environment Variables Configuration Matrix

This matrix documents all configuration and environment variables across InsightLoop, mapping legacy Python/Django variables to their target Node/Express (`apps/api`) and Vite/React (`apps/web`) equivalents.

> [!CAUTION]
> In accordance with safety rules, no real secrets or production credentials are ever printed or committed. All configurations are modeled strictly from `.env.example` and repository code.

---

## 1. Backend Service Configuration Matrix (`insightloop` -> `apps/api`)

| Django Env Variable | Target Node Variable (`apps/api`) | Purpose / Description | Secret? | Default / Example Value | Used in Production? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DJANGO_SECRET_KEY` | `JWT_SECRET` (or `API_SECRET_KEY`) | Cryptographic secret for signing SimpleJWT HS256 tokens and hashing | **YES** | *None (Fails fast if missing or < 32 chars)* | **REQUIRED** on Render |
| `DJANGO_DEBUG` | `NODE_ENV` | Environment mode (`development` vs `production`) | No | `production` (`development` in local) | **REQUIRED** (`production`) |
| `PORT` | `PORT` | Listening port for HTTP and WebSockets | No | `8000` (Local) / Provided by Render in prod | **REQUIRED** |
| `DJANGO_ALLOWED_HOSTS` | `ALLOWED_HOSTS` | Hostnames accepted by HTTP host header validation | No | `localhost,127.0.0.1,insightloop.onrender.com` | **REQUIRED** |
| `DJANGO_CORS_ALLOWED_ORIGINS` / `FRONTEND_ORIGIN` | `CORS_ALLOWED_ORIGINS` / `FRONTEND_ORIGIN` | Allowed origins for CORS with `credentials: true` | No | `http://localhost:5173,https://insightloop.vercel.app` | **REQUIRED** |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | N/A | Django CSRF protection; Express uses stateless JWTs | No | N/A | Inactive in Node |
| `MONGODB_URI` | `MONGODB_URI` | Full MongoDB connection string (Replica Set / Atlas) | **YES** | `mongodb://localhost:27017/InsightLoop` | **REQUIRED** on Render |
| `MONGODB_DB_NAME` | `MONGODB_DB_NAME` | Database name if not specified in URI | No | `InsightLoop` (Tests require suffix `_test`) | **REQUIRED** |
| `MONGODB_CONNECT_ON_INIT`| N/A | Django startup delay flag | No | `true` in Node | Inactive in Node |
| `REDIS_URL` | `REDIS_URL` | Redis connection URL for WebSocket pub/sub fan-out across instances | **YES** | `redis://localhost:6379` (Falls back to in-memory) | Optional (Active if clustered) |
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Web Client ID; verified against `aud` claim | No | `572736622320-...` | **REQUIRED** for Google Login |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | Google OAuth secret (Legacy server-side flow) | **YES** | Optional in JSON API | Inactive in ID-token verify |
| `GOOGLE_REDIRECT_URI` | N/A | Legacy OAuth redirect endpoint | No | N/A | Inactive in ID-token verify |
| `WHATSAPP_PROVIDER` | `WHATSAPP_PROVIDER` | Active WhatsApp backend (`meta` vs `openwa`) | No | `openwa` (dev) / `meta` (prod) | **REQUIRED** if WhatsApp used |
| `WHATSAPP_API_VERSION` | `WHATSAPP_API_VERSION` | Meta Graph API version | No | `v21.0` | Active if provider is `meta` |
| `WHATSAPP_PHONE_NUMBER_ID`| `WHATSAPP_PHONE_NUMBER_ID`| Meta Phone Number ID for Cloud API | No | Provided in Meta Business Manager | Active if provider is `meta` |
| `WHATSAPP_ACCESS_TOKEN`| `WHATSAPP_ACCESS_TOKEN` | Meta System User permanent access token | **YES** | System token | Active if provider is `meta` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID`| `WHATSAPP_BUSINESS_ACCOUNT_ID`| Meta WhatsApp Business Account ID | No | Business ID | Active if provider is `meta` |
| `WHATSAPP_BILL_TEMPLATE_NAME`| `WHATSAPP_BILL_TEMPLATE_NAME`| Pre-approved Meta message template name | No | `bill_share` | Active if provider is `meta` |
| `WHATSAPP_BILL_TEMPLATE_LANGUAGE`| `WHATSAPP_BILL_TEMPLATE_LANGUAGE`| Template language code | No | `en_US` | Active if provider is `meta` |
| `OPENWA_BASE_URL` | `OPENWA_BASE_URL` | Self-hosted OpenWA server URL | No | `http://localhost:2785` | Active if provider is `openwa`|
| `OPENWA_API_KEY` | `OPENWA_API_KEY` | API secret key sent in `x-api-key` header to OpenWA | **YES** | Secret key | Active if provider is `openwa`|
| `EMAIL_BACKEND` | N/A | Django email driver | No | N/A (Node uses nodemailer) | Inactive in Node |
| `EMAIL_HOST` | `SMTP_HOST` | SMTP server host | No | `smtp.gmail.com` | Optional (Contact form) |
| `EMAIL_PORT` | `SMTP_PORT` | SMTP port | No | `587` | Optional (Contact form) |
| `EMAIL_USE_TLS` | `SMTP_SECURE` | TLS / STARTTLS flag | No | `true` | Optional (Contact form) |
| `EMAIL_HOST_USER` | `SMTP_USER` | SMTP username | **YES** | Email address | Optional (Contact form) |
| `EMAIL_HOST_PASSWORD` | `SMTP_PASSWORD` | SMTP application password | **YES** | Password | Optional (Contact form) |
| `DEFAULT_FROM_EMAIL` | `EMAIL_FROM` | Sender address for outgoing emails | No | `noreply@insightloop.io` | Optional (Contact form) |
| `ADMIN_EMAIL` | `EMAIL_ADMIN` | Recipient address for `/contact` form inquiries | No | `admin@insightloop.io` | Optional (Contact form) |
| `AWS_ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` | S3 Access Key ID for uploaded brand assets & exports | **YES** | S3 key | Optional (Fixes ephemeral disk)|
| `AWS_SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` | S3 Secret Access Key | **YES** | S3 secret | Optional (Fixes ephemeral disk)|
| `AWS_STORAGE_BUCKET_NAME` | `AWS_STORAGE_BUCKET_NAME`| S3 Bucket Name | No | Bucket name | Optional (Fixes ephemeral disk)|
| `AWS_S3_REGION_NAME` | `AWS_S3_REGION_NAME` | S3 AWS Region | No | `ap-south-1` | Optional (Fixes ephemeral disk)|
| `GITHUB_*`, `LINKEDIN_*`| N/A | Legacy social auth parameters | **YES** | None | **DEAD** (Retain in .env.example) |

---

## 2. Frontend Client Configuration Matrix (`frontend` -> `apps/web`)

| Vite Env Variable | Target Variable (`apps/web`) | Purpose / Description | Default / Example Value |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `VITE_API_BASE_URL` | Base URL for REST API calls made by Axios | `http://localhost:8000/api/v1` (Local) <br> `https://insightloop.onrender.com/api/v1` (Prod) |
| `VITE_WS_BASE_URL` | `VITE_WS_BASE_URL` | Base URL for WebSockets (Dashboard and AI Assistant) | `ws://localhost:8000` (Local) <br> `wss://insightloop.onrender.com` (Prod) |
| `VITE_GOOGLE_CLIENT_ID`| `VITE_GOOGLE_CLIENT_ID` | Google Identity Services client ID for client-side sign-in button | `572736622320-...` |

---

## 3. Zod-Validated Environment Bootstrapping Guard (`apps/api/src/config/env.ts`)

In Phase 3, `apps/api` will bootstrap through a strict Zod validator that fails immediately if critical secrets are omitted or malformed:

```typescript
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8000),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
  MONGODB_URI: z.string().url("MONGODB_URI must be a valid connection string"),
  MONGODB_DB_NAME: z.string().min(1),
  REDIS_URL: z.string().url().optional().or(z.literal("")),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  WHATSAPP_PROVIDER: z.enum(["meta", "openwa"]).default("openwa"),
  REHASH_PASSWORDS_ON_LOGIN: z.coerce.boolean().default(false),
});
```
