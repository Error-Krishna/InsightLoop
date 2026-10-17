# Migration Risk Register & Mitigation Strategy

This document details the top technical, data-integrity, and operational risks associated with migrating InsightLoop from Django to Node/Express/TypeScript, along with specific mitigations and rollback plans.

---

## 1. Risk Matrix Overview

| Risk ID | Description | Likelihood | Impact | Severity | Primary Mitigation | Rollback Plan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | Multi-Tenancy Data Leakage (Missing `company_id`) | Low | Critical | **CRITICAL** | Strict compile-time `TenantScope` in all Repositories; automated ID-probing integration test across 100% of routes. | Revert frontend to Django API URL (< 5 min). |
| **RSK-02** | User Lockout via Password Hash Incompatibility | Low | Critical | **CRITICAL** | Byte-level reproduction of Django `pbkdf2_sha256` hashing in Node `crypto`; zero password rehashing/upgrading (`REHASH_PASSWORDS_ON_LOGIN=false`). | Immediate rollback to Django; users continue with original hashes untouched. |
| **RSK-03** | Dual-Stack JWT Token Invalidation | Low | High | **HIGH** | Exact replication of simplejwt HS256 claims, token lifetimes (60m access, 7d refresh), and secret key derivation logic. | Both stacks accept tokens minted by the other; switching traffic invalidates zero sessions. |
| **RSK-04** | Financial & Margin Drift via Rounding Differences | Medium | High | **HIGH** | Custom `roundPy(val, digits)` replicating Python half-to-even float rounding; fuzz-tested against 100k+ golden vectors. | Response diffing against Django golden masters before cutover. |
| **RSK-05** | Race Condition: Duplicate Invoice & SKU Numbering | Medium | High | **HIGH** | Additive `counters` collection with atomic `findOneAndUpdate({$inc})`, plus 5-retry fallback matching Django's uniqueness handling. | Additive counters don't break Django; Django fallback continues working. |
| **RSK-06** | Race Condition: Concurrent Stock Overselling | Medium | High | **HIGH** | Atomic conditional `$inc` with `quantity: {$gte: requested}` and replica set transactions. | Additive transactional logic leaves document structure identical. |
| **RSK-07** | Ephemeral File Loss on Render | High | Medium | **HIGH** | Audit all file endpoints; migrate file storage to S3 or GridFS; eliminate writing user assets to ephemeral container disk. | Original uploaded files (if any) remain in S3 / GridFS. |
| **RSK-08** | Worker Completion Partial Failure / Double Stock | Low | High | **HIGH** | Preserve exact 3-step guarded state machine in `MaterialAssignment.complete()`; unit tests with mid-step process termination simulations. | State flags (`synced_to_inventory`, `pay_record_id`) prevent duplicate side effects in both stacks. |
| **RSK-09** | Dual-Write Document Schema Drift | Low | Critical | **CRITICAL** | Zero field renames, removals, or type changes in Mongoose models. Cross-compatibility tests verify Django serializes Node-written docs identically. | Both backends read and write the exact same MongoDB database and collection schemas. |
| **RSK-10** | Naive vs Aware Datetime Serialization Errors | Medium | Medium | **MEDIUM** | MongoDB stores dates as UTC. Node explicitly writes and parses UTC ISO-8601 strings, matching `serialize_value`. | Date formats proven identical in contract tests. |

---

## 2. Detailed Risk Analyses & Protocols

### 2.1 RSK-01: Multi-Tenancy Data Leakage
- **Risk**: A repository query or endpoint handler omits `company_id`, allowing Tenant A to access, modify, or delete Tenant B's data.
- **Architectural Safeguards**:
  1. Every Mongoose repository method requires a strongly-typed `tenant: TenantScope` parameter as its first argument:
     ```typescript
     export interface TenantScope {
       readonly companyId: string;
     }
     ```
  2. ESLint / AST rule or automated integration test suite that executes every endpoint taking an `:id` parameter using Company B's token against Company A's resource, asserting HTTP 404 or 403.
- **Canary / Rollback**: If leakage is detected during preview or canary testing, immediate env flip (`VITE_API_BASE_URL` back to Django ending in `/api/v1`) eliminates exposure within minutes.

### 2.2 RSK-02: Password Hash Verification & Dual-Stack Auth
- **Risk**: If Node's crypto implementation produces a different digest than Django's `make_password`, existing users will receive `401 Invalid email or password` upon attempting to log in.
- **Safeguard**:
  - Django PBKDF2 structure: `pbkdf2_sha256$<iterations>$<salt>$<base64_hash>`.
  - Implement `verifyDjangoPbkdf2`:
    ```typescript
    import crypto from "node:crypto";

    export function verifyDjangoPbkdf2(password: string, storedHash: string): boolean {
      const [algo, iterationsStr, salt, hash] = storedHash.split("$");
      if (algo !== "pbkdf2_sha256" || !iterationsStr || !salt || !hash) return false;
      const iterations = parseInt(iterationsStr, 10);
      const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
      const derivedBase64 = derivedKey.toString("base64");
      return crypto.timingSafeEqual(Buffer.from(derivedBase64), Buffer.from(hash));
    }
    ```
  - Verify against live test fixtures and golden credentials.
  - Disable automatic password rehashing on login (`REHASH_PASSWORDS_ON_LOGIN=false`) until Phase 8.

### 2.3 RSK-03: Dual-Stack JWT Token Invalidation
- **Risk**: Active users in production holding an existing access or refresh token issued by Django are forced to log in again upon deployment of the Node API.
- **Safeguard**:
  - Signing Key: `JWT_SIGNING_KEY = SECRET_KEY.length >= 32 ? SECRET_KEY : crypto.createHash("sha256").update(SECRET_KEY).digest("hex")`.
  - HS256 algorithm.
  - Claims match simplejwt exactly: `{ email, company_id, user_id, name, token_type, exp, iat, jti }`.
  - Lifetimes: Access = 60 minutes, Refresh = 7 days.
  - Verification test: Access token minted by Python is validated by Node; access token minted by Node is validated by Python.

### 2.4 RSK-04: Banker's Rounding & Floating-Point Drift
- **Risk**: JavaScript's standard rounding differs from Python's banker's rounding on half-way values, causing small 1-cent/1-paisa differences in invoice grand totals, tax amounts, or margin analytics.
- **Safeguard**:
  - Write `roundPy(val: number, ndigits: number = 2): number` in `packages/shared`.
  - Fuzz-test against 100,000+ floating point vectors generated by the real Python engine covering ties (e.g. 0.125, 0.375, 2.5, 3.5), negatives, and zero.
  - Assert 0% discrepancy across all golden master fixtures.

### 2.5 RSK-05 & RSK-06: Concurrency, Numbering & Stock Decrement
- **Risk**: Two users simultaneously creating bills or inventory items compute identical invoice numbers (`INV-2026-00010`) or oversell remaining stock.
- **Safeguard**:
  - Invoice/SKU Numbers: Implement additive `counters` collection with atomic `findOneAndUpdate({ _id: "INV-2026-" + company_id }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })`.
  - Preserve 5-retry uniqueness loop for any numbers generated concurrently by Django during canary.
  - Stock Decrement: Use conditional update queries:
    ```typescript
    const result = await InventoryItem.updateOne(
      { _id: itemId, company_id: companyId, quantity: { $gte: requestedQty } },
      { $inc: { quantity: -requestedQty } }
    );
    if (result.matchedCount === 0) throw new InsufficientStockError(...);
    ```

### 2.6 RSK-07: Ephemeral Disk Storage on Render
- **Risk**: Company logos, stamps, signatures, and exported reports written to the local disk are destroyed when Render cycles or scales containers.
- **Safeguard**:
  - User profile pictures are already in MongoDB GridFS (safe).
  - Profile logos/stamps/signatures and export files should be persisted to S3/Cloud storage (or MongoDB GridFS if S3 is not provided by user).
  - Explicitly document required S3 environment variables in `docs/runbooks/env.md`.

### 2.7 RSK-09: Reversible Dual-Write Schema Compatibility
- **Risk**: Node writes a document with different field names, BSON types, or unexpected defaults that cause MongoEngine on Django to fail deserialization or validation during canary or rollback.
- **Safeguard**:
  - `strict: true` on all Mongoose schemas.
  - Explicit collection names (`collection: 'bills'`, etc.) on all models.
  - No Mongoose automatic timestamps (`timestamps: false`); manage `created_at` and `updated_at` explicitly to match Python naive UTC dates.
  - Cross-stack integration test: Document created by Node API -> retrieved via Django DRF serializer -> asserted identical JSON. Document created by Django -> retrieved via Node API -> asserted identical JSON.
