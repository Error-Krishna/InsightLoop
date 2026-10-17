# InsightLoop Production Environment Variables Specification

This document lists all environment variables read by the InsightLoop Node.js/TypeScript backend API service (`apps/api`) in production, their purposes, defaults, and requirements for deployment on Render.

---

## 1. Required Environment Variables on Render

These variables **must** be set in the Render Dashboard (Environment tab) for the production API service:

| Variable Name | Required? | Example / Format | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **YES** | `production` | Enables production mode, strict validation, and security safeguards. |
| `PORT` | **YES** (by Render) | `4000` | Port on which Express listens (Render injects `PORT` automatically). |
| `MONGODB_URI` | **YES** | `mongodb+srv://user:pass@cluster.mongodb.net/InsightLoop` | MongoDB Atlas connection string. (Rejects `_test` suffix in production). |
| `MONGODB_DB_NAME` | **YES** | `InsightLoop` | Target MongoDB database name. |
| `JWT_SECRET` | **YES** | `min-32-chars-cryptographic-random-secret` | Cryptographic secret used to sign and verify HMAC-SHA256 JWT tokens. Must match the secret previously used to preserve existing user sessions. |
| `CORS_ORIGIN` | **YES** | `https://insightloop.vercel.app` | Comma-separated list of allowed browser origins for CORS. |
| `FRONTEND_ORIGIN` | **YES** | `https://insightloop.vercel.app` | Production frontend URL. Used for root `/` redirect and automatically added to CORS. |
| `GOOGLE_CLIENT_ID` | **YES** | `xyz.apps.googleusercontent.com` | Google OAuth2 Client ID for verifying Google Sign-In tokens from the frontend. |
| `METRICS_TOKEN` | **YES** | `min-16-chars-random-secret` | Shared secret token required via `x-metrics-token` header to query `/metrics` and `/health/detailed`. |

---

## 2. Optional Environment Variables & Defaults

| Variable Name | Default Value | Purpose |
| :--- | :--- | :--- |
| `HOST` | `0.0.0.0` | Network binding interface. |
| `JWT_ACCESS_EXPIRES_IN` | `1h` | Access token lifespan. |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifespan. |
| `REDIS_URL` | `""` (in-memory fallback) | Optional Redis connection string for distributed rate limiting & pub/sub. |
| `APP_TIME_ZONE` | `UTC` | Server reference timezone for date boundaries and aggregations. |
| `TRUST_PROXY` | `1` | Reverse proxy trust level for client IP detection behind Render/Cloudflare. |
| `STORAGE_DRIVER` | `gridfs` | File storage driver (`gridfs`, `s3`, or `local`). Defaults to MongoDB GridFS. |
| `S3_BUCKET_NAME` | `""` | AWS S3 bucket name (required if `STORAGE_DRIVER=s3`). |
| `AWS_REGION` | `""` | AWS S3 region (e.g. `ap-south-1`). |
| `AWS_ACCESS_KEY_ID` | `""` | AWS IAM Access Key ID for S3 storage. |
| `AWS_SECRET_ACCESS_KEY` | `""` | AWS IAM Secret Access Key for S3 storage. |
| `WHATSAPP_ENABLED` | `false` (auto-computed) | WhatsApp messaging toggle. Auto-enabled if valid Meta credentials exist. |
| `WHATSAPP_PROVIDER` | `meta` | WhatsApp provider (`meta` or `openwa`). |
| `WHATSAPP_API_VERSION` | `v21.0` | Meta Graph API version. |
| `WHATSAPP_PHONE_NUMBER_ID`| `""` | Meta Cloud API Sender Phone Number ID. |
| `WHATSAPP_ACCESS_TOKEN` | `""` | Meta Cloud API System User Access Token. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `""` | Meta WhatsApp Business Account ID. |
| `WHATSAPP_BILL_TEMPLATE_NAME` | `bill_share` | Pre-approved Meta message template name. |
| `WHATSAPP_BILL_TEMPLATE_LANGUAGE` | `en_US` | Template language code. |
| `WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR` | `false` | Whether template includes company variable. |
| `OPENWA_BASE_URL` | `http://localhost:2785` | OpenWA bridge URL. |
| `OPENWA_API_KEY` | `""` | OpenWA authentication key. |
| `EMAIL_HOST` | `smtp.gmail.com` | SMTP host for contact form delivery. |
| `EMAIL_PORT` | `587` | SMTP port (STARTTLS). |
| `EMAIL_USE_TLS` | `true` | STARTTLS toggle for SMTP. |
| `EMAIL_HOST_USER` | `""` | SMTP sender username. |
| `EMAIL_HOST_PASSWORD` | `""` | SMTP sender password / App password. |
| `DEFAULT_FROM_EMAIL` | `noreply@insightloop.io` | Default sender email address. |
| `ADMIN_EMAIL` | `admin@insightloop.io` | Destination address for inbound contact submissions. |
| `REHASH_PASSWORDS_ON_LOGIN` | `false` | Password rehashing on login flag. |
| `UPLOAD_DIR` | `./uploads` | Local upload directory if `STORAGE_DRIVER=local`. |
| `MAX_FILE_SIZE_MB` | `10` | Maximum file size in MB for uploads. |
| `AUTH_RATE_LIMIT_WINDOW_MS`| `900000` (15 min) | Rate limiter window duration. |
| `AUTH_RATE_LIMIT_MAX_ATTEMPTS` | `10` | Maximum failed auth attempts per window. |

---

## 3. Strict Parity Guarantees

- **No Fallback Aliases**: Legacy Django environment variables (`DJANGO_SECRET_KEY`, `DJANGO_CORS_ALLOWED_ORIGINS`, `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_REGION_NAME`) are not read. Production Render environments must declare canonical names (`JWT_SECRET`, `CORS_ORIGIN`, `S3_BUCKET_NAME`, `AWS_REGION`).
- **Boolean Parsing (`parseEnvBool`)**: Boolean variables evaluate to `true` strictly for values in `{"1", "true", "yes", "on"}` (case-insensitive, trimmed). All other values evaluate to `false`.
- **Password Hashes**: Existing user passwords stored in Django's PBKDF2 format (`pbkdf2_sha256$...`) continue verifying with byte-for-byte mathematical parity in Node native `crypto.pbkdf2Sync`.
