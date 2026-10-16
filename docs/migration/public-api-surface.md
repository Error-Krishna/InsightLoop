# Public and Operational API Surface

This document catalogs registered Express API routes that are not directly invoked from the React SPA source files (`apps/web/src/`), along with the justification for their existence in the public/operational API surface.

## 1. Health & Telemetry Probes
| Method | Route | Classification | Justification |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Operational | Container / Load-Balancer Liveness Probe (HTTP 200). |
| `GET` | `/health/detailed` | Operational | Readiness probe verifying live connectivity to MongoDB and Redis. |
| `GET` | `/metrics` | Operational | Prometheus / OpenTelemetry metrics endpoint for node runtime & latency. |
| `GET` | `/api/v1/health/live` | Operational | Kubernetes-style liveness probe under API v1 prefix. |
| `GET` | `/api/v1/health/ready` | Operational | Kubernetes-style readiness probe under API v1 prefix. |
| `GET` | `/api/v1/health/detailed` | Operational | Scoped system health and memory diagnostics. |
| `GET` | `/api/v1/health/metrics` | Operational | Scoped Prometheus metrics. |
| `GET` | `/api/v1/metrics` | Operational | Alias for root metrics under API v1 mount. |

## 2. Media Asset & File Streaming
| Method | Route | Classification | Justification |
| :--- | :--- | :--- | :--- |
| `GET` | `/media/*` | Public Asset | GridFS / S3 file streaming endpoint for company logos, CSV imports, and bill attachments. |

## 3. Contact & Inbound Hooks
| Method | Route | Classification | Justification |
| :--- | :--- | :--- | :--- |
| `POST` | `/contact` | Public Inbound | Public landing page / external contact inquiry submission. |
| `ALL`  | `/contact` | Public Inbound | Method guard for public contact endpoint. |
| `POST` | `/api/v1/contact` | Public Inbound | API v1 scoped contact endpoint. |
| `ALL`  | `/api/v1/contact` | Public Inbound | Method guard for API v1 contact endpoint. |

## 4. API-First & Reporting Endpoints
| Method | Route | Classification | Justification |
| :--- | :--- | :--- | :--- |
| `GET`  | `/api/v1/profile` | API Surface | RESTful profile retrieval for CLI, mobile, or external integrations. |
| `GET`  | `/api/v1/profile/settings` | API Surface | RESTful profile settings retrieval. |
| `GET`  | `/api/v1/inventory/warehouse-summary` | API Surface | Legacy route alias for `/api/v1/inventory/meta/warehouse-summary`. |
| `GET`  | `/api/v1/workers/:worker_id` | API Surface | RESTful individual worker detail fetch. |
| `POST` | `/api/v1/bills` | API Surface | Generic bill creation endpoint delegating to pakka/kacha. |
| `ALL`  | `/api/v1/bills/pakka` | API Surface | Method rejection guard for non-POST requests to pakka creation. |
| `ALL`  | `/api/v1/bills/kacha` | API Surface | Method rejection guard for non-POST requests to kacha creation. |
| `POST` | `/api/v1/bills/:id/reopen-profit` | API Surface | Admin/correction endpoint to reopen confirmed profit calculation. |
| `GET`  | `/api/v1/dashboard/overview` | API Surface | Consolidated dashboard overview payload for batch consumers. |
| `GET`  | `/api/v1/dashboard/export/:type` | API Surface | CSV/Excel report streaming download endpoint for dashboard analytics. |
| `GET`  | `/api/v1/insights` | API Surface | RESTful insights list retrieval. |
| `GET`  | `/api/v1/ai/config` | API Surface | Public capabilities and available model configuration for AI assistant. |
| `POST` | `/api/v1/ai/command` | API Surface | HTTP REST fallback for AI command execution (alongside WebSocket). |

## 5. Deprecated Server-Rendered Django Shadow Routes (`NEEDS-TRAFFIC-EVIDENCE`)
These routes are registered in Express to monitor uncataloged legacy traffic. They set `X-InsightLoop-Shadow-Route: legacy-django-view` and respond with 404 JSON while logging access hits to Pino structured logs.
| Method | Route | Classification | Justification |
| :--- | :--- | :--- | :--- |
| `ALL`  | `/login` | Shadow Route | Django legacy server-rendered login view monitor. |
| `ALL`  | `/dashboard` | Shadow Route | Django legacy server-rendered dashboard HTML view monitor. |
| `ALL`  | `/dashboard/api/*` | Shadow Route | Django legacy session-based dashboard API endpoints. |
| `ALL`  | `/insights` | Shadow Route | Django legacy server-rendered insights HTML view monitor. |
| `ALL`  | `/insights/*` | Shadow Route | Django legacy insights form delete/actions monitor. |
| `ALL`  | `/upload` | Shadow Route | Django legacy server-rendered upload view monitor. |
| `ALL`  | `/upload/*` | Shadow Route | Django legacy upload actions monitor. |
| `ALL`  | `/distribution/*` | Shadow Route | Django legacy pay/material distribution HTML views monitor. |
| `ALL`  | `/user/*` | Shadow Route | Django legacy user profile/billing/settings HTML views monitor. |
| `ALL`  | `/aiexport` | Shadow Route | Django legacy server-rendered AI assistant HTML view monitor. |
| `ALL`  | `/aiexport/*` | Shadow Route | Django legacy AI export HTML views monitor. |
| `ALL`  | `/auth/google/callback` | Shadow Route | Django legacy OAuth server-side callback monitor. |
