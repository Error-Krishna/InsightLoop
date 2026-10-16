# Runbook: Post-Canary Python Removal Merge (`chore/remove-python`)

> [!CRITICAL]
> **DO NOT MERGE `chore/remove-python` INTO `migration/mern` NOW.**
>
> `migration/mern` is the deployment and canary branch that intentionally preserves the Django backend (`insightloop/`) to guarantee immediate zero-downtime rollback capability.
>
> The removal branch (`chore/remove-python`) MUST remain completely separate and unmerged until all of the following canary milestones are satisfied:
> 1. Staging deployment completed and verified.
> 2. Manual click-through and acceptance testing completed on staging.
> 3. Production canary rollout completed with Django maintained in hot-standby.
> 4. Minimum 14-day continuous live canary operation with zero production rollbacks.
>
> Only after the full 14-day canary window passes with zero rollbacks is `chore/remove-python` permitted to merge.

---

## 1. Branch Strategy & Architecture Role

| Branch | State | Python / Django Status | Purpose |
| :--- | :--- | :--- | :--- |
| `migration/mern` | **Active Staging & Canary** | **Preserved 100% intact** (`insightloop/` bit-for-bit identical to baseline tag) | Production canary candidate. Runs Node stack with Django ready for instant fallback/rollback. |
| `chore/remove-python` | **Frozen Post-Canary Candidate** | **100% Removed** (Zero `.py`, `.venv`, or Python dependencies) | Pure MERN destination branch. Kept isolated until 14-day canary completes. |

---

## 2. Pre-Merge Verification Checklist (Only After 14-Day Canary)

Before merging `chore/remove-python`, the on-call engineer must verify:
- [ ] Staging click-through signoff documented.
- [ ] Canary traffic reached 100% on Node without triggering rollback alarms.
- [ ] At least 14 consecutive days of production operation on Node.
- [ ] Production error rates, latency (P95/P99), and financial ledger audits match or exceed Django baselines.
- [ ] Staging / Production backup taken.

---

## 3. Reviewing the Removal Diff

To inspect what will be eliminated when the 14-day canary concludes:

```bash
# View list of removed/modified files
git diff --stat migration/mern...chore/remove-python

# Verify zero Python files on chore/remove-python
git checkout chore/remove-python
find . -name "*.py" -not -path "*/node_modules/*"
# Expected: 0 hits

# Inspect the full diff against migration/mern
git diff migration/mern...chore/remove-python
```

Expected deletions on `chore/remove-python`:
- Complete `insightloop/` Django application (140 Python files + templates/static assets)
- Python runtime dependencies (`requirements.txt`, `requirements-lock.txt`, `.venv`, `Pipfile`)
- Legacy Python test/seed scripts (`seed_test_db.py`, `export_django_model_schema.py`, etc.)
- Python Dockerfiles / Procfiles and Python CI workflow jobs

---

## 4. Execution Commands (Post-14-Day Canary Only)

Only after the 14-day canary policy is fulfilled:

```bash
# 1. Ensure working directory is completely clean
git status

# 2. Switch to migration/mern
git checkout migration/mern
git pull origin migration/mern

# 3. Merge chore/remove-python
git merge chore/remove-python -m "chore: remove Python/Django codebase following successful 14-day canary"

# 4. Run python-free integrity validation suite
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
node scripts/check_wiring.mjs
node scripts/check_silent_errors.mjs
node scripts/check_branch_coverage.mjs

# 5. Push clean removal to origin
git push origin migration/mern
```

---

## 5. Emergency Rollback Procedure

If any issue arises during or immediately after the merge:

```bash
# Revert the merge commit
git reset --hard HEAD~1

# Confirm Django codebase is 100% restored
git diff pre-mern-migration-2026-10-15..HEAD -- insightloop/
# (Must return 0 diffs against the golden baseline tag)

# Restart Django daphne / gunicorn services
```
