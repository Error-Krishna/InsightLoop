# Production Secret Rotation Runbook

## 1. Scope & Security Posture
This runbook details zero-downtime secret rotation procedures for InsightLoop production services:
1. `JWT_SECRET` (Authentication signing keys)
2. `MONGODB_URI` (Atlas cluster database credentials)
3. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (OAuth SSO credentials)
4. `REDIS_URL` (Cache & Rate limiting credentials)

---

## 2. JWT Secret Rotation (`JWT_SECRET`)

### Challenge
Tokens minted with the old secret will fail signature validation if the secret is swapped abruptly, logging out all active enterprise users and breaking active sessions.

### Zero-Downtime Drain Strategy
- InsightLoop access tokens have a short TTL (15 minutes).
- Refresh tokens have a 7-day TTL.

#### Phase 1: Dual-Secret Verification Window
1. Update `env.ts` / API deployment to support `JWT_SECRET` (primary for signing new tokens) and `JWT_SECRET_FALLBACK` (secondary for verifying older tokens during drain).
2. Set in Render Environment:
   - `JWT_SECRET`: `<NEW_STRONG_SECRET_AT_LEAST_32_CHARS>`
   - `JWT_SECRET_FALLBACK`: `<CURRENT_ACTIVE_SECRET>`
3. Deploy API services.
   - All **new** logins and refresh requests mint tokens with `<NEW_STRONG_SECRET>`.
   - Any requests presenting tokens minted under `<CURRENT_ACTIVE_SECRET>` are accepted via fallback.

#### Phase 2: Session Drain & Finalization
1. Wait **15 minutes** (until all active access tokens expire and refresh against the new secret).
2. For long-lived refresh tokens: Users refresh automatically on first active session.
3. Remove `JWT_SECRET_FALLBACK` from Render Environment after 7 days (or immediately after planned maintenance window).
4. Restart API services. Old secret is permanently decommissioned.

---

## 3. MongoDB Atlas Database Credentials Rotation

### Zero-Downtime Rotation Procedure
1. **Create Secondary Database User in MongoDB Atlas**:
   - Navigate to **Atlas Dashboard -> Database Access -> Add New Database User**.
   - Username: `insightloop-app-v2`
   - Role: `readWrite` on `InsightLoop_prod`
   - Generate high-entropy 64-character password.
2. **Update Application Environment**:
   - Update `MONGODB_URI` in Render Environment:
     ```
     mongodb+srv://insightloop-app-v2:<PASSWORD>@cluster.mongodb.net/InsightLoop_prod?retryWrites=true&w=majority
     ```
3. **Trigger Rolling Deployment**:
   - Render initiates a rolling deployment. New containers establish connections with `insightloop-app-v2`. Old containers gracefully drain active connections.
4. **Decommission Legacy User**:
   - Verify zero active connections on legacy user in Atlas Metrics.
   - Delete legacy user `insightloop-app-v1` from Atlas Database Access.

---

## 4. Google OAuth Credentials Rotation

### Procedure
1. Navigate to **Google Cloud Console -> APIs & Services -> Credentials**.
2. Under **OAuth 2.0 Client IDs**, select the InsightLoop web client.
3. Generate a new Client Secret.
4. Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Render Dashboard.
5. Deploy updated environment.
6. Verify Google OAuth sign-in flow on staging/production.
7. Delete the old client secret in Google Cloud Console.

---

## 5. Emergency Secret Leak Incident Response

If a secret is inadvertently committed or leaked:
1. **Immediate Revocation**: Generate and deploy new secret immediately (accepting session logout impact).
2. **Purge User Sessions**: If `JWT_SECRET` was compromised, increment user token version or purge sessions:
   ```bash
   # Emergency token invalidation: Rotate JWT_SECRET without fallback
   ```
3. **Audit Access Logs**:
   - Inspect API access logs for anomalous requests matching the compromise timestamp.
4. **File Incident Report**: Document timeline, blast radius, and remediation in `docs/migration/incident_reports/`.
