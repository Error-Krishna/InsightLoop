# Phase 8: Django Decommissioning & Cleanup Plan

> [!IMPORTANT]
> **Status: WRITTEN ONLY — EXECUTION STRICTLY LOCKED.**  
> Phase 8 remains locked until Phase 6 (Staging Deploy) and Phase 7 (Canary & 100% Production Cutover) have completed and the mandatory **14-day rollback observation window** has expired with zero rollbacks or critical regression incidents.

---

## 1. Timeline & Rollback Deadline

- **Phase 7 100% Cutover Date**: `T_CUTOVER` (Day 0)
- **Observation Window**: Exactly 14 Calendar Days (`T_CUTOVER` to `T_CUTOVER + 14d`)
- **Rollback Window Expiration**: 23:59 UTC on Day 14.
- **Phase 8 Authorization Gate**: Executive sign-off from Engineering Lead after verifying:
  1. Zero traffic hitting Django backend for 14 consecutive days.
  2. 100% of API endpoints, background jobs, and WebSockets handled by Node.js API with error rates < 0.05%.
  3. Complete database consistency and financial ledger verification.

---

## 2. Inventory of Files & Directories for Decommissioning

Upon formal authorization of Phase 8, the following legacy Python artifacts will be permanently removed from the repository:

| Path / Target | Purpose / Type | Deletion Strategy |
| :--- | :--- | :--- |
| `insightloop/` | Complete Django application codebase (models, views, serializers, urls, asgi, wsgi, settings) | `git rm -r insightloop/` |
| `requirements.txt` | Python dependency lockfile | `git rm requirements.txt` |
| `render.yaml` | Legacy Python Render service definition (superseded by `render-blueprint.yaml`) | `git rm render.yaml` |
| `.venv/` | Local Python virtual environment | `rm -rf .venv/` (already in `.gitignore`) |
| `scripts/seed_test_db.py` | Python DB seeding script (to be migrated to Node) | `git rm scripts/seed_test_db.py` |
| `scripts/run_snapshot_parity.mjs` | Dual-stack parity load script (no longer applicable once Django is removed) | Archive or retain in `scripts/archive/` |
| `scripts/test_dual_stack.mjs` | Dual-stack interoperability script | Archive or retain in `scripts/archive/` |

---

## 3. Infrastructure & Routing Switchover

### DNS & CDN Routing
1. **Cloudflare / Load Balancer Rules**:
   - Delete routing rules forwarding traffic to the legacy Django Render service (`insightloop.onrender.com`).
   - Point root and API subdomains directly to the Node API service (`insightloop-api.onrender.com`).
2. **Decommission Django Cloud Service**:
   - Spin down the Daphne ASGI service on Render / AWS ECS.
   - Archive deployment logs and environment variable backups.

### Docker & Local Development Cleanup
1. `docker-compose.yml` remains clean, continuing to provision local development backing services (MongoDB 7.0 + Redis 7.2-alpine).
2. Root `package.json` scripts updated to remove Python references (`PYTHONPATH`, `.venv/bin/python`).
3. CI/CD GitHub Actions:
   - Remove Python matrix setup (`actions/setup-python`).
   - Retain Turborepo, Node.js 20+, and pnpm build & test workflows.

---

## 4. Archival & Historical Record Preservation

To preserve git history and auditability:
1. Create immutable archival tag prior to file removal:
   ```bash
   git tag -a post-django-decommissioning-archive -m "Archive commit prior to Phase 8 Django removal"
   ```
2. Golden master fixtures in `apps/api/test/contracts/fixtures/` are permanently retained as regression contracts for future API enhancements.
3. Commit message convention for Phase 8 removal:
   ```
   chore(decommission): execute Phase 8 Django codebase removal after 14-day observation window
   ```
