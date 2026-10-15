# InsightLoop Environment Variables & Rotation Runbook

## Overview
This runbook documents every configuration and secret required for production deployment across Render, Vercel, and Atlas, including secret rotation procedures.

---

## 1. Secrets & Environment Inventory

| Variable | Target Service | Purpose & Usage | Rotation Procedure |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Node API / Django | Signs and verifies user authentication tokens. Must be >= 32 characters in production. | Mint secondary secret, update both stacks with dual verification, drain existing tokens (access tokens expire in 60m), remove old secret. |
| `MONGODB_URI` | Node API / Django | Connection URI for MongoDB Atlas cluster. Must include authentication credentials. | Create new Atlas database user, update `MONGODB_URI` on Render, restart API services, drop old Atlas database user. |
| `MONGODB_DB_NAME` | Node API / Django | Target database name (`insightloop`). In production, booted server rejects any DB ending with `_test`. | Controlled schema migration procedure. |
| `GOOGLE_CLIENT_ID` | Node API / Web / Django | OAuth2 client ID used to verify Google Identity tokens. | Generate new OAuth 2.0 Client ID in Google Cloud Console, update Web app and Node API env, revoke old client ID. |
| `CORS_ORIGIN` | Node API | Allowed frontend origin for CORS policies (e.g., `https://app.insightloop.com`). | Update env on Render with comma-separated origins during cutover, update DNS, remove deprecated origin. |
| `REDIS_URL` | Node API / Django | Optional Redis connection string for rate limiting and WebSocket fan-out. | Create new Redis instance, swap `REDIS_URL`, restart container. Fallback to in-memory is automatic if unset. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Node API / Django | S3 credentials for file uploads (logos, signatures, attachments). | Rotate IAM credentials in AWS console, update env, verify upload, deactivate old IAM key. |
| `S3_BUCKET_NAME` / `AWS_REGION` | Node API | S3 target bucket configuration. Fallback to MongoDB GridFS is supported if unset. | Standard S3 bucket policy management. |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | Node API / Django | SMTP credentials for contact form submissions. | Rotate SMTP provider credentials (SendGrid / Postmark / Mailgun). |
