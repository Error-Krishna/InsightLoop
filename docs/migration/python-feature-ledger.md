# Python Feature Parity Ledger (Phase 5.8)

This document catalogs every Python file in the `insightloop/` Django codebase and maps it to its corresponding TypeScript implementation in the Node/Express backend or React frontend. Every row is strictly validated by `scripts/check_feature_ledger.mjs`.

## Status Definitions
- **PORTED**: Feature logic is fully migrated to Node/React, tested, and verified for exact parity.
- **SUPERSEDED**: Replaced by standard Node/MERN architecture (e.g. Express middleware, native BSON/JSON, Vite SPA).
- **DEAD-CODE**: Django admin, legacy ORM migrations, or unused scripts with zero production dependencies.
- **NEEDS-TRAFFIC-EVIDENCE**: Legacy server-rendered HTML routes replaced by SPA client routes; monitored via shadow route diagnostic headers.

## Feature Parity Matrix

| Django File | Status | Node Target | Parity Evidence | Residual Diffs |
| :--- | :--- | :--- | :--- | :--- |
| insightloop/aiexport/__init__.py | PORTED | apps/api/src/modules/ai/ai.routes.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/aiexport/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/aiexport/ai_processor.py | PORTED | apps/api/src/modules/ai/ai.service.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/aiexport/api_urls.py | PORTED | apps/api/src/modules/ai/ai.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/aiexport/api_views.py | PORTED | apps/api/src/modules/ai/ai.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/aiexport/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/aiexport/consumers.py | PORTED | apps/api/src/ws/gateway.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/aiexport/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/aiexport/models.py | PORTED | apps/api/src/modules/ai/ai.service.ts | docs/migration/evidence/B1_doc_shape_report.txt | None |
| insightloop/aiexport/routing.py | PORTED | apps/api/src/ws/gateway.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/aiexport/tests.py | SUPERSEDED | apps/api/test/domains_coverage.test.ts | Automated test suite in apps/api/test/ | None |
| insightloop/aiexport/urls.py | PORTED | apps/api/src/modules/ai/ai.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/aiexport/views.py | PORTED | apps/api/src/modules/ai/ai.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/bills/__init__.py | PORTED | apps/api/src/modules/bills/bills.routes.ts | apps/api/test/bills_exhaustive_branches.test.ts | None |
| insightloop/bills/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/bills/models.py | PORTED | apps/api/src/modules/bills/bills.repository.ts | apps/api/test/bills_exhaustive_branches.test.ts | None |
| insightloop/bills/pdf.py | PORTED | apps/api/src/modules/bills/pdf.service.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/bills/profit.py | PORTED | apps/api/src/modules/bills/bills.service.ts | docs/migration/evidence/C2_coverage_mutation.txt | None |
| insightloop/bills/urls.py | PORTED | apps/api/src/modules/bills/bills.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/bills/views.py | PORTED | apps/api/src/modules/bills/bills.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/bills/whatsapp.py | SUPERSEDED | apps/api/src/modules/bills/whatsapp.service.ts | WhatsApp provider abstraction in apps/api/src/modules/bills/whatsapp.service.ts | None |
| insightloop/bills/whatsapp_openwa.py | PORTED | apps/api/src/modules/bills/whatsapp.service.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/dashboard/__init__.py | PORTED | apps/api/src/modules/dashboard/dashboard.routes.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/dashboard/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/dashboard/api_urls.py | PORTED | apps/api/src/modules/dashboard/dashboard.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/dashboard/api_views.py | PORTED | apps/api/src/modules/dashboard/dashboard.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/dashboard/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/dashboard/consumers.py | PORTED | apps/api/src/ws/gateway.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/dashboard/data_service.py | PORTED | apps/api/src/modules/dashboard/dashboard.service.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/dashboard/encoders.py | SUPERSEDED | apps/api/src/utils/timezone.ts | Native Node JSON serialization and formatDjangoIso formatting | None |
| insightloop/dashboard/management/__init__.py | DEAD-CODE | N/A (Management) | Django management command package init | None |
| insightloop/dashboard/management/commands/__init__.py | DEAD-CODE | N/A (Commands) | Django management command package init | None |
| insightloop/dashboard/management/commands/process_uploaded_data.py | PORTED | apps/api/src/modules/upload/upload.service.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/dashboard/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/dashboard/models.py | PORTED | apps/api/src/modules/dashboard/dashboard.repository.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/dashboard/queries.py | PORTED | apps/api/src/modules/dashboard/dashboard.repository.ts | docs/migration/evidence/C3_load_benchmark.txt | None |
| insightloop/dashboard/routing.py | PORTED | apps/api/src/ws/gateway.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/dashboard/tests.py | SUPERSEDED | apps/api/test/domains_coverage.test.ts | Automated test suite in apps/api/test/ | None |
| insightloop/dashboard/urls.py | PORTED | apps/api/src/modules/dashboard/dashboard.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/dashboard/utils.py | PORTED | apps/api/src/utils/timezone.ts | apps/api/test/timezone_format.test.ts | None |
| insightloop/dashboard/views.py | PORTED | apps/api/src/modules/dashboard/dashboard.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/__init__.py | PORTED | apps/api/src/server.ts | Node server startup in apps/api/src/server.ts | None |
| insightloop/insightloop/api_ai_urls.py | PORTED | apps/api/src/modules/ai/ai.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/api_auth_urls.py | PORTED | apps/api/src/modules/auth/auth.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/api_bills_urls.py | PORTED | apps/api/src/modules/bills/bills.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/api_dashboard_urls.py | PORTED | apps/api/src/modules/dashboard/dashboard.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/api_insights_urls.py | PORTED | apps/api/src/modules/insights/insights.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/api_inventory_urls.py | PORTED | apps/api/src/modules/inventory/inventory.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/api_profile_urls.py | PORTED | apps/api/src/modules/profile/profile.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/api_root_urls.py | PORTED | apps/api/src/app.ts | Root URL mounting in apps/api/src/app.ts | None |
| insightloop/insightloop/api_upload_urls.py | PORTED | apps/api/src/modules/upload/upload.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/api_urls.py | PORTED | apps/api/src/app.ts | API router aggregation in apps/api/src/app.ts | None |
| insightloop/insightloop/api_utils.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/insightloop/api_workers_urls.py | PORTED | apps/api/src/modules/workers/workers.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insightloop/asgi.py | SUPERSEDED | apps/api/src/server.ts | Node HTTP and WebSocket server in apps/api/src/server.ts | None |
| insightloop/insightloop/auth_utils.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/insightloop/jwt_middleware.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/insightloop/middleware.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/insightloop/public_urls.py | PORTED | apps/api/src/app.ts | Public route handling in apps/api/src/app.ts | None |
| insightloop/insightloop/settings.py | PORTED | apps/api/src/config/env.ts | Typed Zod environment schema in apps/api/src/config/env.ts | None |
| insightloop/insightloop/tests.py | SUPERSEDED | apps/api/test/domains_coverage.test.ts | Vitest suite in apps/api/test/ | None |
| insightloop/insightloop/urls.py | PORTED | apps/api/src/app.ts | Main URL routing in apps/api/src/app.ts | None |
| insightloop/insightloop/wsgi.py | SUPERSEDED | apps/api/src/server.ts | Express HTTP listener in apps/api/src/server.ts | None |
| insightloop/insights/__init__.py | PORTED | apps/api/src/modules/insights/insights.routes.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/insights/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/insights/api_urls.py | PORTED | apps/api/src/modules/insights/insights.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insights/api_views.py | PORTED | apps/api/src/modules/insights/insights.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insights/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/insights/management/__init__.py | DEAD-CODE | N/A (Management) | Django management command package init | None |
| insightloop/insights/management/commands/__init__.py | DEAD-CODE | N/A (Commands) | Django management command package init | None |
| insightloop/insights/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/insights/models.py | PORTED | apps/api/src/modules/insights/insights.repository.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/insights/tests.py | SUPERSEDED | apps/api/test/domains_coverage.test.ts | Automated test suite in apps/api/test/ | None |
| insightloop/insights/urls.py | PORTED | apps/api/src/modules/insights/insights.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/insights/utils.py | PORTED | apps/api/src/modules/insights/insights.service.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/insights/views.py | PORTED | apps/api/src/modules/insights/insights.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/inventory/__init__.py | PORTED | apps/api/src/modules/inventory/inventory.routes.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/inventory/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/inventory/models.py | PORTED | apps/api/src/modules/inventory/inventory.repository.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/inventory/urls.py | PORTED | apps/api/src/modules/inventory/inventory.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/inventory/views.py | PORTED | apps/api/src/modules/inventory/inventory.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/landing/__init__.py | PORTED | apps/api/src/modules/auth/auth.routes.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/landing/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/landing/api_views.py | PORTED | apps/api/src/modules/auth/auth.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/landing/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/landing/auth_backends.py | PORTED | apps/api/src/modules/auth/auth.service.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/landing/auth_urls.py | PORTED | apps/api/src/modules/auth/auth.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/landing/authentication.py | PORTED | apps/api/src/middleware/auth.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/landing/migrations/0001_initial.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/landing/migrations/0002_delete_user.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/landing/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/landing/models.py | DEAD-CODE | apps/api/src/modules/auth/auth.repository.ts | Relational model replaced by MongoDB User collection | None |
| insightloop/landing/mongo_models.py | PORTED | apps/api/src/modules/auth/auth.repository.ts | docs/migration/evidence/B1_doc_shape_report.txt | None |
| insightloop/landing/serializers.py | PORTED | apps/api/src/modules/auth/auth.routes.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/landing/social_models.py | PORTED | apps/api/src/modules/auth/auth.repository.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/landing/social_storage.py | PORTED | apps/api/src/modules/auth/auth.service.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/landing/tests.py | SUPERSEDED | apps/api/test/required_branch_density.test.ts | Automated test suite in apps/api/test/ | None |
| insightloop/landing/urls.py | PORTED | apps/api/src/modules/contact/contact.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/landing/views.py | PORTED | apps/api/src/modules/contact/contact.controller.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/manage.py | SUPERSEDED | package.json | Replaced by npm/pnpm workspace CLI commands | None |
| insightloop/misc/__init__.py | PORTED | apps/api/src/modules/profile/profile.routes.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/misc/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/misc/api_urls.py | PORTED | apps/api/src/modules/profile/profile.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/misc/api_views.py | PORTED | apps/api/src/modules/profile/profile.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/misc/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/misc/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/misc/models.py | DEAD-CODE | N/A (Models) | Unused misc Django model placeholders | None |
| insightloop/misc/tests.py | SUPERSEDED | apps/api/test/required_branch_density.test.ts | Automated test suite in apps/api/test/ | None |
| insightloop/misc/urls.py | PORTED | apps/api/src/modules/profile/profile.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/misc/views.py | NEEDS-TRAFFIC-EVIDENCE | apps/web/src/features/profile/ProfilePage.tsx | Server-rendered HTML profile page replaced by React SPA; monitored via shadow route headers | None |
| insightloop/seed_data.py | SUPERSEDED | scripts/seed.ts | Replaced by TypeScript seeder scripts/seed.ts | None |
| insightloop/upload/__init__.py | PORTED | apps/api/src/modules/upload/upload.routes.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/upload/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/upload/api_urls.py | PORTED | apps/api/src/modules/upload/upload.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/upload/api_views.py | PORTED | apps/api/src/modules/upload/upload.controller.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/upload/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/upload/forms.py | SUPERSEDED | apps/api/src/modules/upload/upload.routes.ts | Replaced by Express Multer multipart processing | None |
| insightloop/upload/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/upload/models.py | PORTED | apps/api/src/modules/upload/upload.repository.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/upload/tests.py | SUPERSEDED | apps/api/test/domains_coverage.test.ts | Automated test suite in apps/api/test/ | None |
| insightloop/upload/urls.py | PORTED | apps/api/src/modules/upload/upload.routes.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/upload/utils.py | PORTED | apps/api/src/modules/upload/upload.service.ts | apps/api/test/domains_coverage.test.ts | None |
| insightloop/upload/views.py | NEEDS-TRAFFIC-EVIDENCE | apps/web/src/features/upload/UploadPage.tsx | Server-rendered HTML upload page replaced by React SPA; monitored via shadow route headers | None |
| insightloop/worker/__init__.py | PORTED | apps/api/src/modules/workers/workers.routes.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/worker/admin.py | DEAD-CODE | N/A (Admin) | Django admin unused in MERN single-page architecture | None |
| insightloop/worker/api_urls.py | PORTED | apps/api/src/modules/workers/workers.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/worker/api_views.py | PORTED | apps/api/src/modules/workers/workers.controller.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/worker/apps.py | SUPERSEDED | apps/api/src/app.ts | Express application mounting in apps/api/src/app.ts | None |
| insightloop/worker/management/__init__.py | DEAD-CODE | N/A (Management) | Django management command package init | None |
| insightloop/worker/management/commands/__init__.py | DEAD-CODE | N/A (Commands) | Django management command package init | None |
| insightloop/worker/management/commands/backfill_inventory_from_production.py | DEAD-CODE | N/A (One-off script) | Historical migration script for Django production DB backfill | None |
| insightloop/worker/middleware.py | SUPERSEDED | apps/api/src/middleware/auth.ts | Tenant scoping middleware in apps/api/src/middleware/auth.ts | None |
| insightloop/worker/migrations/__init__.py | DEAD-CODE | N/A (Migrations) | Native MongoDB document store requires no relational migrations | None |
| insightloop/worker/models.py | PORTED | apps/api/src/modules/workers/workers.repository.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/worker/templatetags/__init__.py | DEAD-CODE | N/A (Templatetags) | Django template filters package init | None |
| insightloop/worker/templatetags/material_filters.py | DEAD-CODE | N/A (Templatetags) | Django template filters unused in React single-page frontend | None |
| insightloop/worker/tests.py | SUPERSEDED | apps/api/test/required_branch_density.test.ts | Automated test suite in apps/api/test/ | None |
| insightloop/worker/urls.py | PORTED | apps/api/src/modules/workers/workers.routes.ts | docs/migration/evidence/parity_django_vs_node.txt | None |
| insightloop/worker/utils.py | PORTED | apps/api/src/modules/workers/workers.service.ts | apps/api/test/required_branch_density.test.ts | None |
| insightloop/worker/views.py | NEEDS-TRAFFIC-EVIDENCE | apps/web/src/features/workers/WorkersPage.tsx | Server-rendered HTML worker view replaced by React SPA; monitored via shadow route headers | None |
