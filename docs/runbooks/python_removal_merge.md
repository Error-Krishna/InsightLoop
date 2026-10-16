# Runbook: Merging the Python-Free Branch (`chore/remove-python`)

## Executive Summary
This runbook guides the review, merge, and verification of branch `chore/remove-python` into `migration/mern`.
On `chore/remove-python`, the product is 100% MERN:
- The entire `insightloop/` Django application is removed.
- Python runtime dependencies (`requirements.txt`, `requirements-lock.txt`, `.venv`) and legacy `*.py` scripts are completely eliminated (`find . -name "*.py" -not -path "*/node_modules/*"` returns 0).
- Pure TypeScript seed (`scripts/seed.ts`) and offline static parity snapshots (`test/snapshot_parity.test.ts`) completely replace the live Django Daphne server.
- Monorepo builds, typechecks, lints, and passes all tests completely offline without Python.

---

## 1. Review the Diff
To review the exact files removed and modified between `migration/mern` and `chore/remove-python`:

```bash
# View list of removed/modified files
git diff --stat migration/mern...chore/remove-python

# Verify that ZERO Python files remain on chore/remove-python
find . -name "*.py" -not -path "*/node_modules/*"

# View the full diff
git diff migration/mern...chore/remove-python
```

Expected output:
- `insightloop/` tree deleted (140 Python files + templates/static assets)
- `requirements.txt` and `requirements-lock.txt` deleted
- Legacy Python scripts (`seed_test_db.py`, `export_django_model_schema.py`, `generate_golden_vectors.py`) deleted
- Zero `.py` files remain in the repository

---

## 2. Command to Merge into `migration/mern`
Once you approve the deletion of the Python codebase:

```bash
# 1. Switch back to migration/mern
git checkout migration/mern

# 2. Merge chore/remove-python cleanly (fast-forward or merge commit)
git merge chore/remove-python -m "chore: remove Python/Django codebase and verify 100% MERN independence"

# 3. Verify clean working directory
git status
```

---

## 3. Rollback Procedure (Emergency Abort)
If for any reason you wish to restore the dual-stack baseline before or after merge:

```bash
# If before merge:
git checkout migration/mern

# If after merge and you want to roll back the merge commit:
git reset --hard HEAD~1

# To verify that the intact Python codebase is restored:
git diff pre-mern-migration-2026-10-15..HEAD -- insightloop/
# (Must return 0 diffs against the golden baseline tag)
```

---

## 4. Post-Merge Smoke Checklist
Execute the full automated verification suite to prove complete MERN independence:

1. **Monorepo Build**:
   ```bash
   pnpm build
   ```
   *Expected: All 3 workspaces (@insightloop/shared, @insightloop/api, @insightloop/web) build successfully.*

2. **TypeScript & Lint Verification**:
   ```bash
   pnpm typecheck
   pnpm lint
   ```
   *Expected: 0 errors.*

3. **Architecture & Integrity Gates**:
   ```bash
   node scripts/check_wiring.mjs
   node scripts/check_silent_errors.mjs
   node scripts/check_dependencies_and_dead_code.mjs
   pnpm audit --audit-level high
   ```
   *Expected: All checks report 100% PASS with 0 violations.*

4. **Python-Free Safety Net Verification**:
   ```bash
   # Schema parity (verifies Node collections against frozen schema hash)
   pnpm --filter @insightloop/api test test/schema_parity.test.ts

   # Negative input rejection suite (24 fixtures)
   pnpm --filter @insightloop/api test test/negative_fixtures.test.ts

   # Snapshot parity (17 static Django snapshots with zero diff)
   pnpm --filter @insightloop/api test test/snapshot_parity.test.ts
   ```
   *Expected: 14/14 tests pass cleanly without Daphne or Python installed.*

5. **Branch Coverage Thresholds**:
   ```bash
   node scripts/check_branch_coverage.mjs
   ```
   *Expected: All files meet required branch coverage thresholds (>=90% core / >=85% / >=80%).*

6. **Local Runtime Smoke Test**:
   ```bash
   # Seed local database using pure TypeScript
   pnpm tsx scripts/seed.ts mongodb://localhost:27017/InsightLoop_test

   # Start Node API
   pnpm --filter @insightloop/api dev
   # In a separate terminal, test health endpoint:
   curl http://localhost:4000/health
   # Expected: {"status":"healthy", ...}
   ```
