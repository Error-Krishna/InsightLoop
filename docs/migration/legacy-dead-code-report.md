# Legacy & Dead Code Audit Report

This report evaluates legacy, inactive, and server-rendered components within the InsightLoop repository.

In accordance with Phase 0 Amendment 3:
> *Code evidence is not enough: any route whose usage cannot be proven from code is marked as `NEEDS-TRAFFIC-EVIDENCE`. The user will review Render access logs to determine whether external traffic reaches these endpoints before decommissioning in Phase 8.*

---

## 1. Top-Level Architectural Shift

InsightLoop originally operated as a monolithic Django application with server-rendered HTML templates, session-based authentication (`request.session`), and Django CSRF tokens.

The application has since migrated its client interface to a standalone React Single-Page Application (`frontend/`, deployed on Vercel) that authenticates exclusively via JWT (`Authorization: Bearer <token>`) against `/api/v1/*`.

As a consequence, several server-rendered views and session endpoints remain present in the Django codebase. Until Phase 8, **no Python code will be deleted**.

---

## 2. Server-Rendered Django Templates (`templates/`)

All HTML templates (with one critical exception) reside in the top-level `insightloop/templates/` directory:

| Template Path | Referencing View | Render Mode | Verdict | Action Required |
| :--- | :--- | :--- | :--- | :--- |
| `bills/templates/bills/invoice.html` | `bills/pdf.py:render_bill_pdf` | WeasyPrint HTML-to-PDF compiler | **ACTIVE (CRITICAL)** | Reproduce layout & styling in Node HTML-to-PDF service. |
| `templates/base.html` | Base layout for Django pages | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Confirm if external requests hit HTML views. |
| `templates/dashboard/Dashboard.html` | `dashboard/views.py:dashboard` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/dashboard/`. |
| `templates/insights/InsightDetails.html` | `insights/views.py:insights` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/insights/`. |
| `templates/upload/DataUpload.html` | `upload/views.py:upload` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/upload/`. |
| `templates/workers/Worker.html` | `worker/views.py:pay_distribution` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/distribution/pay_distribution/`. |
| `templates/workers/MaterialDistribution.html` | `worker/views.py:material_distribution` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/distribution/material_distribution/`. |
| `templates/AIExport/Export&AI.html` | `aiexport/views.py:ai_export` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/aiexport/`. |
| `templates/misc/Profile.html` | `misc/views.py:profile` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/user/profile/`. |
| `templates/misc/Billing.html` | `misc/views.py:billing` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/user/billing/`. |
| `templates/misc/Setting.html` | `misc/views.py:settings` | Server-rendered HTML | `NEEDS-TRAFFIC-EVIDENCE` | Check Render logs for `/user/settings/`. |
| `templates/landing/home.html` | Previously rendered by `landing/views.py` | Removed from views; root now redirects to `FRONTEND_ORIGIN` | `DEAD-CODE-CANDIDATE` | Retain until Phase 8. |
| `templates/landing/login-signup.html` | Removed from views | Replaced by React `/login` & `/signup` | `DEAD-CODE-CANDIDATE` | Retain until Phase 8. |
| `templates/landing/social_signup_company.html`| Removed from views | Replaced by React Google Sign-in | `DEAD-CODE-CANDIDATE` | Retain until Phase 8. |

---

## 3. Legacy Non-API Routes Audit

The routes below are registered in `insightloop/urls.py` outside `/api/v1/`:

| Route Path | Handler / View | Code Evidence | Traffic Verdict | Proposed Migration Handling |
| :--- | :--- | :--- | :--- | :--- |
| `GET /` | `landing.urls:root_redirect` | Redirects to `FRONTEND_ORIGIN` or returns `{"status": "ok"}` | **ACTIVE** | Implement root redirect / status in Express `app.ts`. |
| `POST /contact` | `landing.views:contact_view` | Saves `ContactMessage`, sends admin email | **ACTIVE (LEGACY FORM)** | Port to Express (`POST /contact` and `POST /api/v1/contact/`). |
| `GET /dashboard/` | `dashboard.views:dashboard` | Not called by React SPA (`frontend/` calls `/api/v1/dashboard/*`) | `NEEDS-TRAFFIC-EVIDENCE` | If traffic exists, redirect to frontend `/dashboard`. |
| `GET /dashboard/api/summary/` | `dashboard.views:summary_data` | Session-based summary endpoint | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /dashboard/api/charts/rev_exp/` | `dashboard.views:rev_exp_chart` | Session-based chart | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /dashboard/api/charts/profit_trends/` | `dashboard.views:profit_trends` | Session-based chart | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /dashboard/api/workers/payments/` | `dashboard.views:worker_payments` | Session-based payments | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /dashboard/api/top_workers/` | `dashboard.views:top_workers` | Session-based top workers | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /insights/` | `insights.views:insights` | Renders `InsightDetails.html` | `NEEDS-TRAFFIC-EVIDENCE` | If traffic exists, redirect to frontend `/insights`. |
| `GET /insights/delete/<id>/` | `insights.views:delete_insight` | Session-based HTML form delete | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET, POST /upload/` | `upload.views:upload` | Session-based HTML CSV upload | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /distribution/pay_distribution/` | `worker.views:pay_distribution` | Session-based distribution HTML | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /distribution/material_distribution/` | `worker.views:material_distribution` | Session-based material HTML | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /aiexport/` | `aiexport.views:ai_export` | Session-based AI HTML | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /user/profile/` | `misc.views:profile` | Session-based profile HTML | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /user/billing/` | `misc.views:billing` | Session-based billing HTML | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |
| `GET /user/settings/` | `misc.views:settings` | Session-based settings HTML | `NEEDS-TRAFFIC-EVIDENCE` | Verify against access logs. |

---

## 4. Unused Models, Dependencies & Artifacts

### 4.1 Social Auth Leftovers (`landing/social_models.py` & `landing/social_storage.py`)
- **Code Evidence**: Contains MongoEngine classes `UserSocialAuth`, `Nonce`, `Association`.
- **Database Status**: The local MongoDB scan confirmed that collections `user_social_auth`, `nonce`, and `association` have **0 documents** and do not even exist in the live database.
- **Analysis**: Legacy `django-social-auth` remnants. Active authentication uses `landing/api_views.py:GoogleLoginApiView` with direct Google Identity Services token verification.
- **Verdict**: Unused in runtime. Leave files untouched until Phase 8.

### 4.2 Local SQLite Artifact (`db.sqlite3`)
- **Code Evidence**: File exists at `insightloop/db.sqlite3` with size 0 bytes.
- **Settings Evidence**: `DATABASES` in `settings.py` is configured with `django.db.backends.sqlite3` only to satisfy Django core requirements (sessions/contenttypes/auth migrations). All real application data resides in MongoDB via MongoEngine.
- **Verdict**: Artifact of Django's relational database requirement. Not utilized by business operations.

### 4.3 S3 Storage Configuration vs Requirements
- **Code Evidence**: `settings.py` lines 433-450 configure `storages.backends.s3boto3.S3Boto3Storage` if AWS keys are set.
- **Dependency Audit**: `django-storages` and `boto3` are **missing** from `requirements.txt`.
- **Finding**: Setting `USE_S3_STORAGE=True` in Python would fail with an `ImportError` unless `django-storages` was installed. Therefore, all production file uploads (logos, signatures, exports) default to the ephemeral local disk (`MEDIA_ROOT`).
- **Verdict**: Design flaw in Python backend. Node stack must implement robust S3 / cloud storage upload handling with local disk fallback.
