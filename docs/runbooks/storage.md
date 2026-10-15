# Runtime Storage Architecture & Ephemeral Disk Runbook

## 1. Storage Architecture Overview

InsightLoop processes customer business data, CSV bulk records, and financial summaries. In cloud container environments (such as Render Web Services, AWS ECS, or Fly.io), local container filesystems are strictly **ephemeral**. Any files written to container local disks are destroyed upon container redeployment, restart, or scaling.

| Layer | Implementation | Scope & Lifecycle | Failure Mode / Mitigations |
| :--- | :--- | :--- | :--- |
| **In-Memory Buffers** | `multer.memoryStorage()` | Request-scoped in RAM | Limited to 10MB per file; garbage-collected immediately after parsing. |
| **Database Persistence** | MongoDB Atlas (`business_data`, `financial_summaries`) | Persistent cluster storage | High availability multi-node replica set with automated snapshots. |
| **Temporary Local Scratch** | Node `/tmp/insightloop-uploads` (or OS temp dir) | Ephemeral container disk | Pruned automatically via `scripts/verify_storage_cleanup.mjs`. |
| **Production Blob Storage** | AWS S3 / Cloudflare R2 / GridFS | Long-term durable storage | Target architecture for persistent assets (worker photos, bill PDFs). |

---

## 2. In-Memory Processing & Ephemeral Disk Guards

### Current Implementation
- `apps/api/src/modules/upload/upload.routes.ts` configures Multer using `memoryStorage()` with a hard limit of `10 * 1024 * 1024` bytes (10MB).
- Uploaded CSV files are streamed as Node `Buffer` objects, parsed via `csv-parse/sync`, validated, and inserted directly into MongoDB collections.
- Temporary files are never left lingering on container root partitions.

### Ephemeral Disk Safety Script
To protect staging and development environments from disk exhaustion if scratch exports or temporary files are generated:
- Script: [`scripts/verify_storage_cleanup.mjs`](file:///scripts/verify_storage_cleanup.mjs)
- Execution:
  ```bash
  # Standalone scan & cleanup (1-hour TTL)
  node scripts/verify_storage_cleanup.mjs

  # Dry-run inspection
  node scripts/verify_storage_cleanup.mjs --dry-run
  ```
- Environment Variables:
  - `TEMP_STORAGE_DIR`: Path to scratch directory (default: system temp `/tmp/insightloop-uploads`).
  - `STORAGE_MAX_AGE_MS`: Maximum allowed file age before eviction (default: `3600000` = 1 hour).
  - `STORAGE_MAX_BYTES`: Total scratch volume safety threshold (default: `524288000` = 500MB).

---

## 3. Production Storage Migration (S3 & GridFS)

When deploying to multi-instance production environments where persistent file attachments (e.g., invoice PDFs, worker verification documents, or export archives) are required:

### Option A: AWS S3 / Cloudflare R2 (Recommended for Production)
1. **Infrastructure Provisioning**:
   - Create private S3 bucket: `insightloop-production-assets`.
   - Enable SSE-S3 AES-256 server-side encryption.
   - Configure Lifecycle rule: expire temporary export files after 7 days.
2. **IAM Least-Privilege Policy**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::insightloop-production-assets/*"
       }
     ]
   }
   ```
3. **Application Integration**:
   - Utilize presigned S3 URLs (`@aws-sdk/s3-request-presigner`) for direct browser uploads, bypassing API servers and eliminating upload bandwidth bottlenecks.
   - Store S3 object keys (not public URLs) in MongoDB documents with tenant scoping.

### Option B: MongoDB GridFS (Zero-Infrastructure Alternative)
- For smaller deployments without AWS infrastructure:
  - Utilize MongoDB GridFS (`mongodb.GridFSBucket`).
  - Automatically shards chunks across existing MongoDB clusters.
  - Retains built-in tenant filtering and transaction support.

---

## 4. Runbook: Ephemeral Disk Cleanup Checklist

1. **Verify scratch disk usage**:
   ```bash
   node scripts/verify_storage_cleanup.mjs
   ```
2. **Cron Automation (Staging/Production Dockerfile / Render cron)**:
   ```cron
   0 * * * * node /app/scripts/verify_storage_cleanup.mjs >> /var/log/storage-clean.log 2>&1
   ```
3. **Check container disk space**:
   ```bash
   df -h /tmp
   ```
