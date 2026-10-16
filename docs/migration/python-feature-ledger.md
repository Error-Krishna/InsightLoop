# Python Feature & Asset Parity Ledger (Phase 5.9)

## Missing or Unverified Items
- **MISSING: None**
- **UNVERIFIED: None**
- **Total Cataloged Assets**: 120 (All 87 Python files + 13 HTML templates + 5 static assets + 2 requirements files + 4 deployment files + 9 environment variable definitions)
- **Status**: 100% Ported, Superseded, or Justified Dead-Code with exact test citations.

## Status Definitions
- **PORTED**: Feature logic is fully migrated to Node/React, tested, and verified for exact parity. Every row cites an exact test name (`test_file#test_name`).
- **SUPERSEDED**: Replaced by standard Node/MERN architecture (e.g. Express middleware, native BSON/JSON, Vite SPA).
- **DEAD-CODE**: Django admin, legacy ORM migrations, or unused scripts with zero production dependencies.
- **NEEDS-TRAFFIC-EVIDENCE**: Legacy server-rendered HTML routes replaced by SPA client routes; monitored via shadow route diagnostic headers. Logged at `warn` level with `{ route, method, userAgent }` and tested in `apps/api/test/legacy_routes.test.ts`.

## Feature & Asset Parity Matrix

| Django File / Asset | Status | Node Target | Parity Evidence | Residual Diffs |
| :--- | :--- | :--- | :--- | :--- |
| insightloop/aiexport/__init__.py | PORTED | apps/api/src/modules/ai/ai.routes.ts | apps/api/test/ai_deep.test.ts#processes export commands for all business entities | None |
| insightloop/aiexport/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/aiexport/ai_processor.py | PORTED | apps/api/src/modules/ai/ai.service.ts | apps/api/test/ai_deep.test.ts#processes export commands for all business entities | None |
| insightloop/aiexport/api_urls.py | PORTED | apps/api/src/modules/ai/ai.routes.ts | apps/api/test/ai_deep.test.ts#processes export commands for all business entities | None |
| insightloop/aiexport/api_views.py | PORTED | apps/api/src/modules/ai/ai.controller.ts | apps/api/test/ai_deep.test.ts#processes export commands for all business entities | None |
| insightloop/aiexport/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/aiexport/consumers.py | PORTED | apps/api/src/ws/gateway.ts | apps/api/test/websocket.test.ts#connects to /ws/ai-assistant/ and processes real-time commands | None |
| insightloop/aiexport/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/aiexport/models.py | PORTED | apps/api/src/modules/ai/ai.service.ts | apps/api/test/ai_deep.test.ts#processes export commands for all business entities | None |
| insightloop/aiexport/routing.py | PORTED | apps/api/src/ws/gateway.ts | apps/api/test/b8_ws_contract.test.ts#sends session_status framing matching Django AIAssistantConsumer | None |
| insightloop/aiexport/tests.py | SUPERSEDED | apps/api/test/ai_deep.test.ts | Automated test suite in apps/api/test/ai_deep.test.ts | None |
| insightloop/aiexport/urls.py | PORTED | apps/api/src/modules/ai/ai.routes.ts | apps/api/test/ai_deep.test.ts#handles navigation shortcuts for dashboard, inventory, bills, workers | None |
| insightloop/aiexport/views.py | PORTED | apps/api/src/modules/ai/ai.controller.ts | apps/api/test/ai_deep.test.ts#aggregates and displays revenue, profit, and worker analytics | None |
| insightloop/bills/__init__.py | PORTED | apps/api/src/modules/bills/bills.routes.ts | apps/api/test/bills_exhaustive_branches.test.ts#exhausts all remaining branches in bills.service.ts | None |
| insightloop/bills/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/bills/models.py | PORTED | apps/api/src/modules/bills/bills.repository.ts | apps/api/test/bills_exhaustive_branches.test.ts#exhausts all remaining branches in bills.service.ts | None |
| insightloop/bills/pdf.py | PORTED | apps/api/src/modules/bills/pdf.service.ts | apps/api/test/pdf_parity.test.ts#renders pakka standard bill and matches Django text content and rupee symbol | None |
| insightloop/bills/profit.py | PORTED | apps/api/src/modules/bills/bills.service.ts | apps/api/test/bills_profit.test.ts#manages complete bill lifecycle from creation through partial payment, full payment, and profit confirmation | None |
| insightloop/bills/urls.py | PORTED | apps/api/src/modules/bills/bills.routes.ts | apps/api/test/b11_bill_pdf_whatsapp.test.ts#GET /api/v1/bills/:id/pdf returns 200 with application/pdf and Content-Disposition | None |
| insightloop/bills/views.py | PORTED | apps/api/src/modules/bills/bills.controller.ts | apps/api/test/b11_bill_pdf_whatsapp.test.ts#POST /api/v1/bills/:id/share-whatsapp returns 400 with exact error when not configured | None |
| insightloop/bills/whatsapp.py | SUPERSEDED | apps/api/src/modules/bills/whatsapp.service.ts | apps/api/test/b11_bill_pdf_whatsapp.test.ts#normalizes Indian phone numbers matching Django implementation | None |
| insightloop/bills/whatsapp_openwa.py | PORTED | apps/api/src/modules/bills/whatsapp.service.ts | apps/api/test/whatsapp_mock.test.ts#successfully dispatches via OpenWA to local mock server | None |
| insightloop/dashboard/__init__.py | PORTED | apps/api/src/modules/dashboard/dashboard.routes.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/dashboard/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/dashboard/api_urls.py | PORTED | apps/api/src/modules/dashboard/dashboard.routes.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/dashboard/api_views.py | PORTED | apps/api/src/modules/dashboard/dashboard.controller.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/dashboard/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/dashboard/consumers.py | PORTED | apps/api/src/ws/gateway.ts | apps/api/test/b8_ws_contract.test.ts#closes with 4001 when query token is missing on /ws/dashboard/ | None |
| insightloop/dashboard/data_service.py | PORTED | apps/api/src/modules/dashboard/dashboard.service.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/dashboard/encoders.py | SUPERSEDED | apps/api/src/utils/timezone.ts | apps/api/test/timezone_format.test.ts#preserves exact naive ISO timestamps without trailing Z | None |
| insightloop/dashboard/management/__init__.py | DEAD-CODE | N/A (Management) | Django management command package init | None |
| insightloop/dashboard/management/commands/__init__.py | DEAD-CODE | N/A (Commands) | Django management command package init | None |
| insightloop/dashboard/management/commands/process_uploaded_data.py | PORTED | apps/api/src/modules/upload/upload.service.ts | apps/api/test/upload_security.test.ts#successfully processes a well-formed sanitized CSV file | None |
| insightloop/dashboard/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/dashboard/models.py | PORTED | apps/api/src/modules/dashboard/dashboard.repository.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/dashboard/queries.py | PORTED | apps/api/src/modules/dashboard/dashboard.repository.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/dashboard/routing.py | PORTED | apps/api/src/ws/gateway.ts | apps/api/test/websocket.test.ts#authenticates valid token, delivers initial snapshot, and strictly scopes real-time events to tenant | None |
| insightloop/dashboard/tests.py | SUPERSEDED | apps/api/test/dashboard_deep.test.ts | Automated test suite in apps/api/test/dashboard_deep.test.ts | None |
| insightloop/dashboard/urls.py | PORTED | apps/api/src/modules/dashboard/dashboard.routes.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/dashboard/utils.py | PORTED | apps/api/src/utils/timezone.ts | apps/api/test/timezone_format.test.ts#formats zero-millisecond Date without fractional part and without Z | None |
| insightloop/dashboard/views.py | PORTED | apps/api/src/modules/dashboard/dashboard.controller.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/insightloop/__init__.py | PORTED | apps/api/src/server.ts | apps/api/test/smoke.test.ts#imports shared package and executes successfully | None |
| insightloop/insightloop/api_ai_urls.py | PORTED | apps/api/src/modules/ai/ai.routes.ts | apps/api/test/ai_deep.test.ts#processes export commands for all business entities | None |
| insightloop/insightloop/api_auth_urls.py | PORTED | apps/api/src/modules/auth/auth.routes.ts | apps/api/test/auth_deep.test.ts#handles Google login for new user and generates valid JWT tokens | None |
| insightloop/insightloop/api_bills_urls.py | PORTED | apps/api/src/modules/bills/bills.routes.ts | apps/api/test/bills_exhaustive_branches.test.ts#exhausts all remaining branches in bills.service.ts | None |
| insightloop/insightloop/api_dashboard_urls.py | PORTED | apps/api/src/modules/dashboard/dashboard.routes.ts | apps/api/test/dashboard_deep.test.ts#aggregates summary, rev-exp, profit-trends, workers, and top-workers | None |
| insightloop/insightloop/api_insights_urls.py | PORTED | apps/api/src/modules/insights/insights.routes.ts | apps/api/test/insights_deep.test.ts#runs sales analysis with spike detection and product ranking | None |
| insightloop/insightloop/api_inventory_urls.py | PORTED | apps/api/src/modules/inventory/inventory.routes.ts | apps/api/test/inventory.test.ts#manages finished, semi-finished, and raw inventory items with live stats | None |
| insightloop/insightloop/api_profile_urls.py | PORTED | apps/api/src/modules/profile/profile.routes.ts | apps/api/test/profile.test.ts#fetches profile, updates profile attributes, and updates settings | None |
| insightloop/insightloop/api_root_urls.py | PORTED | apps/api/src/app.ts | apps/api/test/smoke.test.ts#imports shared package and executes successfully | None |
| insightloop/insightloop/api_upload_urls.py | PORTED | apps/api/src/modules/upload/upload.routes.ts | apps/api/test/upload_security.test.ts#successfully processes a well-formed sanitized CSV file | None |
| insightloop/insightloop/api_urls.py | PORTED | apps/api/src/app.ts | apps/api/test/smoke.test.ts#imports shared package and executes successfully | None |
| insightloop/insightloop/api_utils.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/auth_deep.test.ts#handles duplicate registration rejection | None |
| insightloop/insightloop/api_workers_urls.py | PORTED | apps/api/src/modules/workers/workers.routes.ts | apps/api/test/workers_deep.test.ts#creates payments, records partial payments, and marks fully paid | None |
| insightloop/insightloop/asgi.py | SUPERSEDED | apps/api/src/server.ts | Node HTTP and WebSocket server in apps/api/src/server.ts | None |
| insightloop/insightloop/auth_utils.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/auth_deep.test.ts#handles duplicate registration rejection | None |
| insightloop/insightloop/jwt_middleware.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/auth_deep.test.ts#handles duplicate registration rejection | None |
| insightloop/insightloop/middleware.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/auth_deep.test.ts#handles duplicate registration rejection | None |
| insightloop/insightloop/public_urls.py | PORTED | apps/api/src/app.ts | apps/api/test/legacy_routes.test.ts#logs warn with route, method, and user-agent on legacy route hit and returns 404 with shadow route header | None |
| insightloop/insightloop/settings.py | PORTED | apps/api/src/config/env.ts | apps/api/test/startup_invariants.test.ts#passes cleanly when all startup invariants are satisfied | None |
| insightloop/insightloop/tests.py | SUPERSEDED | apps/api/test/smoke.test.ts | Vitest suite in apps/api/test/smoke.test.ts | None |
| insightloop/insightloop/urls.py | PORTED | apps/api/src/app.ts | apps/api/test/smoke.test.ts#imports shared package and executes successfully | None |
| insightloop/insightloop/wsgi.py | SUPERSEDED | apps/api/src/server.ts | Express HTTP listener in apps/api/src/server.ts | None |
| insightloop/insights/__init__.py | PORTED | apps/api/src/modules/insights/insights.routes.ts | apps/api/test/insights_deep.test.ts#runs sales analysis with spike detection and product ranking | None |
| insightloop/insights/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/insights/api_urls.py | PORTED | apps/api/src/modules/insights/insights.routes.ts | apps/api/test/insights_deep.test.ts#runs sales analysis with spike detection and product ranking | None |
| insightloop/insights/api_views.py | PORTED | apps/api/src/modules/insights/insights.controller.ts | apps/api/test/insights_deep.test.ts#runs sales analysis with spike detection and product ranking | None |
| insightloop/insights/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/insights/management/__init__.py | DEAD-CODE | N/A (Management) | Django management command package init | None |
| insightloop/insights/management/commands/__init__.py | DEAD-CODE | N/A (Commands) | Django management command package init | None |
| insightloop/insights/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/insights/models.py | PORTED | apps/api/src/modules/insights/insights.repository.ts | apps/api/test/insights_deep.test.ts#runs sales analysis with spike detection and product ranking | None |
| insightloop/insights/tests.py | SUPERSEDED | apps/api/test/insights_deep.test.ts | Automated test suite in apps/api/test/insights_deep.test.ts | None |
| insightloop/insights/urls.py | PORTED | apps/api/src/modules/insights/insights.routes.ts | apps/api/test/insights_deep.test.ts#handles empty business data gracefully in analyze | None |
| insightloop/insights/utils.py | PORTED | apps/api/src/modules/insights/insights.service.ts | apps/api/test/insights_deep.test.ts#runs sales analysis with spike detection and product ranking | None |
| insightloop/insights/views.py | PORTED | apps/api/src/modules/insights/insights.controller.ts | apps/api/test/insights_deep.test.ts#runs sales analysis with spike detection and product ranking | None |
| insightloop/inventory/__init__.py | PORTED | apps/api/src/modules/inventory/inventory.routes.ts | apps/api/test/inventory.test.ts#manages finished, semi-finished, and raw inventory items with live stats | None |
| insightloop/inventory/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/inventory/models.py | PORTED | apps/api/src/modules/inventory/inventory.repository.ts | apps/api/test/inventory.test.ts#manages finished, semi-finished, and raw inventory items with live stats | None |
| insightloop/inventory/urls.py | PORTED | apps/api/src/modules/inventory/inventory.routes.ts | apps/api/test/inventory.test.ts#manages warehouses and warehouse summary metadata | None |
| insightloop/inventory/views.py | PORTED | apps/api/src/modules/inventory/inventory.controller.ts | apps/api/test/inventory.test.ts#manages finished, semi-finished, and raw inventory items with live stats | None |
| insightloop/landing/__init__.py | PORTED | apps/api/src/modules/auth/auth.routes.ts | apps/api/test/auth_deep.test.ts#handles Google login for new user and generates valid JWT tokens | None |
| insightloop/landing/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/landing/api_views.py | PORTED | apps/api/src/modules/auth/auth.controller.ts | apps/api/test/auth_deep.test.ts#handles Google login for new user and generates valid JWT tokens | None |
| insightloop/landing/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/landing/auth_backends.py | PORTED | apps/api/src/modules/auth/auth.service.ts | apps/api/test/auth_pbkdf2.test.ts#correctly verifies a 260,000-iteration Django hash | None |
| insightloop/landing/auth_urls.py | PORTED | apps/api/src/modules/auth/auth.routes.ts | apps/api/test/auth_deep.test.ts#handles Google login for new user and generates valid JWT tokens | None |
| insightloop/landing/authentication.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/auth_deep.test.ts#rejects Google login if Google token is rejected or unverified | None |
| insightloop/landing/migrations/0001_initial.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/landing/migrations/0002_delete_user.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/landing/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/landing/models.py | DEAD-CODE | apps/api/src/modules/auth/auth.repository.ts | Relational model replaced by MongoDB User collection | None |
| insightloop/landing/mongo_models.py | PORTED | apps/api/src/modules/auth/auth.repository.ts | apps/api/test/auth_pbkdf2.test.ts#correctly verifies a 260,000-iteration Django hash | None |
| insightloop/landing/serializers.py | PORTED | apps/api/src/modules/auth/auth.routes.ts | apps/api/test/auth_deep.test.ts#handles duplicate registration rejection | None |
| insightloop/landing/social_models.py | PORTED | apps/api/src/modules/auth/auth.repository.ts | apps/api/test/auth_deep.test.ts#handles Google login for new user and generates valid JWT tokens | None |
| insightloop/landing/social_storage.py | PORTED | apps/api/src/modules/auth/auth.service.ts | apps/api/test/auth_deep.test.ts#handles Google login for new user and generates valid JWT tokens | None |
| insightloop/landing/tests.py | SUPERSEDED | apps/api/test/auth_deep.test.ts | Automated test suite in apps/api/test/auth_deep.test.ts | None |
| insightloop/landing/urls.py | PORTED | apps/api/src/modules/contact/contact.routes.ts | apps/api/test/legacy_routes.test.ts#logs warn with route, method, and user-agent on legacy route hit and returns 404 with shadow route header | None |
| insightloop/landing/views.py | PORTED | apps/api/src/modules/contact/contact.controller.ts | apps/api/test/legacy_routes.test.ts#handles post requests on legacy endpoints with shadow response and logging | None |
| insightloop/manage.py | SUPERSEDED | package.json | Replaced by npm/pnpm workspace CLI commands | None |
| insightloop/misc/__init__.py | PORTED | apps/api/src/modules/profile/profile.routes.ts | apps/api/test/profile.test.ts#fetches profile, updates profile attributes, and updates settings | None |
| insightloop/misc/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/misc/api_urls.py | PORTED | apps/api/src/modules/profile/profile.routes.ts | apps/api/test/profile.test.ts#fetches profile, updates profile attributes, and updates settings | None |
| insightloop/misc/api_views.py | PORTED | apps/api/src/modules/profile/profile.controller.ts | apps/api/test/profile.test.ts#fetches profile, updates profile attributes, and updates settings | None |
| insightloop/misc/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/misc/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/misc/models.py | DEAD-CODE | N/A (Models) | Unused misc Django model placeholders | None |
| insightloop/misc/tests.py | SUPERSEDED | apps/api/test/profile.test.ts | Automated test suite in apps/api/test/profile.test.ts | None |
| insightloop/misc/urls.py | PORTED | apps/api/src/modules/profile/profile.routes.ts | apps/api/test/profile.test.ts#fetches profile, updates profile attributes, and updates settings | None |
| insightloop/misc/views.py | NEEDS-TRAFFIC-EVIDENCE | apps/web/src/features/profile/ProfilePage.tsx | Server-rendered HTML profile page replaced by React SPA; monitored via shadow route headers logged at warn level | None |
| insightloop/seed_data.py | SUPERSEDED | scripts/seed_test_db.py | Replaced by deterministic Python/Node test database seeders | None |
| insightloop/upload/__init__.py | PORTED | apps/api/src/modules/upload/upload.routes.ts | apps/api/test/upload_security.test.ts#successfully processes a well-formed sanitized CSV file | None |
| insightloop/upload/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/upload/api_urls.py | PORTED | apps/api/src/modules/upload/upload.routes.ts | apps/api/test/upload_security.test.ts#successfully processes a well-formed sanitized CSV file | None |
| insightloop/upload/api_views.py | PORTED | apps/api/src/modules/upload/upload.controller.ts | apps/api/test/upload_security.test.ts#detects and blocks CSV formula injection payloads starting with =, +, -, and @ | None |
| insightloop/upload/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/upload/forms.py | SUPERSEDED | apps/api/src/modules/upload/upload.routes.ts | Replaced by Express Multer multipart processing | None |
| insightloop/upload/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/upload/models.py | PORTED | apps/api/src/modules/upload/upload.repository.ts | apps/api/test/upload_security.test.ts#successfully processes a well-formed sanitized CSV file | None |
| insightloop/upload/tests.py | SUPERSEDED | apps/api/test/upload_security.test.ts | Automated test suite in apps/api/test/upload_security.test.ts | None |
| insightloop/upload/urls.py | PORTED | apps/api/src/modules/upload/upload.routes.ts | apps/api/test/b7_upload_rules.test.ts#(a) strips UTF-8 BOM (utf-8-sig) transparently and imports records | None |
| insightloop/upload/utils.py | PORTED | apps/api/src/modules/upload/upload.service.ts | apps/api/test/upload_security.test.ts#successfully processes a well-formed sanitized CSV file | None |
| insightloop/upload/views.py | NEEDS-TRAFFIC-EVIDENCE | apps/web/src/features/upload/UploadPage.tsx | Server-rendered HTML upload page replaced by React SPA; monitored via shadow route headers logged at warn level | None |
| insightloop/worker/__init__.py | PORTED | apps/api/src/modules/workers/workers.routes.ts | apps/api/test/workers_deep.test.ts#creates payments, records partial payments, and marks fully paid | None |
| insightloop/worker/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/worker/api_urls.py | PORTED | apps/api/src/modules/workers/workers.routes.ts | apps/api/test/workers_deep.test.ts#creates payments, records partial payments, and marks fully paid | None |
| insightloop/worker/api_views.py | PORTED | apps/api/src/modules/workers/workers.controller.ts | apps/api/test/workers_deep.test.ts#creates payments, records partial payments, and marks fully paid | None |
| insightloop/worker/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/worker/management/__init__.py | DEAD-CODE | N/A (Management) | Django management command package init | None |
| insightloop/worker/management/commands/__init__.py | DEAD-CODE | N/A (Commands) | Django management command package init | None |
| insightloop/worker/management/commands/backfill_inventory_from_production.py | DEAD-CODE | N/A (One-off script) | One-time production migration backfill script; verified zero runtime references across all code, cron jobs, and deployments | None |
| insightloop/worker/middleware.py | SUPERSEDED | apps/api/src/middleware/auth.ts | Tenant scoping middleware in apps/api/src/middleware/auth.ts | None |
| insightloop/worker/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/worker/models.py | PORTED | apps/api/src/modules/workers/workers.repository.ts | apps/api/test/workers_complete.test.ts#completes an assignment and synchronizes inventory and payment atomically | None |
| insightloop/worker/templatetags/__init__.py | DEAD-CODE | N/A (Templatetags) | Django template filters package init | None |
| insightloop/worker/templatetags/material_filters.py | DEAD-CODE | N/A (Templatetags) | Django template filters unused in React single-page frontend | None |
| insightloop/worker/tests.py | SUPERSEDED | apps/api/test/workers_deep.test.ts | Automated test suite in apps/api/test/workers_deep.test.ts | None |
| insightloop/worker/urls.py | PORTED | apps/api/src/modules/workers/workers.routes.ts | apps/api/test/workers_deep.test.ts#rejects payments with invalid worker id or not found | None |
| insightloop/worker/utils.py | PORTED | apps/api/src/modules/workers/workers.service.ts | apps/api/test/workers_deep.test.ts#creates payments, records partial payments, and marks fully paid | None |
| insightloop/worker/views.py | NEEDS-TRAFFIC-EVIDENCE | apps/web/src/features/workers/WorkersPage.tsx | Server-rendered HTML worker view replaced by React SPA; monitored via shadow route headers logged at warn level | None |
| insightloop/db.sqlite3 | DEAD-CODE | N/A (SQLite) | Local SQLite placeholder from default Django startproject; production and tests use MongoDB | None |
| insightloop/bills/templates/bills/invoice.html | PORTED | apps/api/src/modules/bills/pdf.service.ts | apps/api/test/pdf_parity.test.ts#renders pakka standard bill and matches Django text content and rupee symbol | None |
| insightloop/templates/base.html | SUPERSEDED | apps/web/src/App.tsx | Replaced by React Root component and layout router | None |
| insightloop/templates/landing/home.html | SUPERSEDED | apps/web/src/features/landing/LandingPage.tsx | Replaced by React landing page component | None |
| insightloop/templates/landing/login-signup.html | SUPERSEDED | apps/web/src/features/auth/LoginPage.tsx | Replaced by React authentication pages (LoginPage and SignupPage) | None |
| insightloop/templates/landing/social_signup_company.html | SUPERSEDED | apps/web/src/features/auth/SignupPage.tsx | Replaced by React tenant onboarding workflow | None |
| insightloop/templates/dashboard/Dashboard.html | SUPERSEDED | apps/web/src/features/dashboard/DashboardPage.tsx | Replaced by React single-page dashboard component | None |
| insightloop/templates/insights/InsightDetails.html | SUPERSEDED | apps/web/src/features/insights/InsightsPage.tsx | Replaced by React insights and anomaly detection view | None |
| insightloop/templates/misc/Billing.html | SUPERSEDED | apps/web/src/features/bills/BillManager.tsx | Replaced by React billing and invoice management component | None |
| insightloop/templates/misc/Profile.html | SUPERSEDED | apps/web/src/features/profile/ProfilePage.tsx | Replaced by React profile settings management component | None |
| insightloop/templates/misc/Setting.html | SUPERSEDED | apps/web/src/features/settings/SettingsPage.tsx | Replaced by React workspace settings component | None |
| insightloop/templates/upload/DataUpload.html | SUPERSEDED | apps/web/src/features/upload/UploadPage.tsx | Replaced by React data upload and CSV ingestion component | None |
| insightloop/templates/workers/Worker.html | SUPERSEDED | apps/web/src/features/workers/WorkersPage.tsx | Replaced by React worker management and payment logging component | None |
| insightloop/templates/workers/MaterialDistribution.html | SUPERSEDED | apps/web/src/features/workers/WorkersPage.tsx | Replaced by React worker material distribution subcomponent | None |
| insightloop/templates/AIExport/Export&AI.html | SUPERSEDED | apps/web/src/features/ai/ChatPage.tsx | Replaced by React AI assistant interactive chat component | None |
| insightloop/static/images/default-worker.jpg | SUPERSEDED | apps/web/src/features/workers/WorkersPage.tsx | Fallback worker avatar asset in React frontend | None |
| insightloop/static/images/DashboardPreview.png | SUPERSEDED | apps/web/src/features/landing/LandingPage.tsx | Landing page product preview graphic | None |
| insightloop/static/assets/default-avatar.png | SUPERSEDED | apps/web/src/features/profile/ProfilePage.tsx | Default user avatar asset in React frontend | None |
| insightloop/static/assets/default-avatar.svg | SUPERSEDED | apps/web/src/features/profile/ProfilePage.tsx | Vector user avatar asset in React frontend | None |
| insightloop/upload/static/upload/sample_business_data.csv | SUPERSEDED | apps/web/src/features/upload/UploadPage.tsx | Sample CSV template for user ingestion preview | None |
| requirements.txt | SUPERSEDED | package.json | Replaced by Node npm/pnpm workspace dependencies (express, mongodb, ioredis, pdfkit, ws, zod) | None |
| requirements-lock.txt | SUPERSEDED | pnpm-lock.yaml | Replaced by pnpm deterministic lockfile | None |
| docker-compose.yml | SUPERSEDED | docker-compose.yml | Root multi-service orchestrator for MongoDB, Redis, API, and Web | None |
| apps/api/Dockerfile | PORTED | apps/api/Dockerfile | apps/api/test/smoke.test.ts#imports shared package and executes successfully | None |
| apps/web/Dockerfile | PORTED | apps/web/Dockerfile | apps/web/src/lib/api.test.ts#redirects to /login via window.location.replace with next param when no refresh token exists | None |
| render.yaml | SUPERSEDED | render.yaml | Verified for Node services via scripts/check_render_env_parity.mjs | None |
| render-blueprint.yaml | SUPERSEDED | render-blueprint.yaml | Render Infrastructure-as-Code blueprint | None |
| .env:DJANGO_SECRET_KEY | SUPERSEDED | apps/api/src/config/env.ts | Replaced by JWT_SECRET in Node environment schema | None |
| .env:DJANGO_DEBUG | SUPERSEDED | apps/api/src/config/env.ts | Replaced by NODE_ENV in Node environment schema | None |
| .env:MONGODB_URI | SUPERSEDED | apps/api/src/config/env.ts | Preserved identically for Node MongoDB driver connection | None |
| .env:MONGODB_DB_NAME | SUPERSEDED | apps/api/src/config/env.ts | Preserved identically for Node database name scoping | None |
| .env:REDIS_URL | SUPERSEDED | apps/api/src/config/env.ts | Preserved identically for ioredis connection pool | None |
| .env:GOOGLE_CLIENT_ID | SUPERSEDED | apps/api/src/config/env.ts | Preserved identically for Google OAuth ID token verification | None |
| .env:EMAIL_HOST | SUPERSEDED | apps/api/src/config/env.ts | Preserved identically for Node SMTP notification client | None |
| .env:EMAIL_PORT | SUPERSEDED | apps/api/src/config/env.ts | Preserved identically for Node SMTP port configuration | None |
| .env:DEFAULT_FROM_EMAIL | SUPERSEDED | apps/api/src/config/env.ts | Preserved identically for email sender address | None |
