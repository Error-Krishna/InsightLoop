# Observability, Metrics & Health Diagnostics Runbook

## 1. Overview & Architecture

InsightLoop provides multi-tiered observability designed for container orchestrators (Render, Kubernetes, Docker Swarm) and monitoring agents (Prometheus, Datadog, Grafana Cloud).

```
                     +---------------------------------------+
                     | Prometheus Scraper / Container Probe  |
                     +---------------------------------------+
                                        |
       +--------------------------------+--------------------------------+
       |                                |                                |
       v                                v                                v
GET /health                     GET /health/detailed            GET /metrics
(Liveness probe, 200 OK)       (Structured JSON, 200/503)      (Prometheus format)
       |                                |                                |
       +--------------------------------+--------------------------------+
                                        |
                        +---------------+---------------+
                        | Node.js Runtime Diagnostics   |
                        | - Event Loop Lag (ms)         |
                        | - Memory RSS & Heap (bytes)   |
                        | - Uptime (seconds)            |
                        | - MongoDB Ping & Pool Stats   |
                        | - Redis Ping & Latency (ms)   |
                        +-------------------------------+
```

---

## 2. Endpoint Specification

### A. Liveness Probe: `GET /health` and `GET /api/v1/health/live`
- **Purpose**: Fast Kubernetes/Render liveness check. Confirms HTTP listener is accepting connections.
- **Status Code**: `200 OK`
- **Response**:
  ```json
  { "status": "ok", "service": "InsightLoop Node API" }
  ```

### B. Readiness Probe: `GET /api/v1/health/ready`
- **Purpose**: Traffic routing gate. Confirms core backing services (MongoDB) are reachable.
- **Status Codes**:
  - `200 OK`: Database connected and responsive.
  - `503 Service Unavailable`: MongoDB unreachable.
- **Response**:
  ```json
  {
    "status": "ready",
    "checks": { "mongodb": "up" }
  }
  ```

### C. Detailed System Diagnostics: `GET /health/detailed`
- **Purpose**: Deep runtime introspection for debugging, telemetry, and health dashboards.
- **Status Codes**:
  - `200 OK`: System healthy.
  - `503 Service Unavailable`: Core backing service degraded.
- **Sample Payload**:
  ```json
  {
    "status": "healthy",
    "ready": true,
    "uptime_seconds": 3642.15,
    "timestamp": "2026-10-16T03:45:00.000Z",
    "event_loop_lag_ms": 0.312,
    "memory": {
      "rss_bytes": 74858496,
      "heap_total_bytes": 48234496,
      "heap_used_bytes": 36128490,
      "external_bytes": 2841920
    },
    "checks": {
      "mongodb": {
        "status": "up",
        "latency_ms": 1.25,
        "pool": { "maxPoolSize": 100, "minPoolSize": 0 }
      },
      "redis": {
        "configured": false,
        "status": "disabled"
      }
    }
  }
  ```

### D. Prometheus Metrics: `GET /metrics` and `GET /api/v1/metrics`
- **Purpose**: Standard exposition format for Prometheus scraping (`text/plain; version=0.0.4`).
- **Metrics Exported**:
  - `process_uptime_seconds`: Process uptime gauge.
  - `nodejs_eventloop_lag_seconds`: Immediate execution queue delay gauge.
  - `nodejs_memory_rss_bytes`: Resident Set Size memory allocation.
  - `nodejs_memory_heap_used_bytes`: V8 engine active heap memory.
  - `mongodb_up`: 1 if responsive, 0 if connection dropped.
  - `mongodb_ping_latency_ms`: Roundtrip database ping latency in milliseconds.
  - `redis_up`: 1 if connected, 0 if failing, -1 if disabled.

---

## 3. Security & Access Control (`METRICS_TOKEN`)

To prevent unauthorized public exposure of internal runtime state (memory usage, event loop lag, connection pools, and Redis status), diagnostic and Prometheus endpoints are protected:

1. **Public Probes (Zero Auth Required)**:
   - `GET /health`
   - `GET /api/v1/health/live`
   - `GET /api/v1/health/ready`
   - These provide lightweight health/readiness status for orchestrator probes (Render, Kubernetes) without exposing internal infrastructure details.

2. **Protected Diagnostics & Metrics (Token Required)**:
   - `GET /health/detailed` and `GET /api/v1/health/detailed`
   - `GET /metrics` and `GET /api/v1/metrics`
   - **Authentication**: Requires a shared secret matching the `METRICS_TOKEN` environment variable.
   - **Header options**:
     - `x-metrics-token: <METRICS_TOKEN>`
     - `Authorization: Bearer <METRICS_TOKEN>`
   - **Unauthenticated Response**: Returns `401 Unauthorized`:
     ```json
     { "error": "Unauthorized: Missing or invalid metrics authorization token." }
     ```
   - **Production Requirement**: In production (`NODE_ENV=production`), `METRICS_TOKEN` is mandatory; the service fails fast on startup if this secret is missing.

---

## 4. Django vs Node Observability Delta

| Feature | Legacy Django Architecture | Modern MERN Node Architecture |
| :--- | :--- | :--- |
| **Liveness Check** | Root `/health/` had no standardized unauthenticated bypass in simplejwt settings. | Unauthenticated root `/health` and `/api/v1/health/live` always accessible without token. |
| **Readiness Probe** | Did not perform active database ping on probes. | Explicit `db.command({ ping: 1 })` with automated 503 HTTP status on database drop. |
| **Diagnostics Security** | No native Prometheus metrics; debug toolbar insecure if left enabled. | Secret token protection (`METRICS_TOKEN`) on `/health/detailed` and `/metrics` (401 without token). |
| **Event Loop Lag** | Not measurable (synchronous WSGI/ASGI thread pool model). | Non-blocking `setImmediate` high-resolution event loop lag monitoring. |
| **Connection Pooling** | MongoEngine relied on static PyMongo pools with opaque runtime status. | Direct MongoDB driver client pool options inspection (`maxPoolSize`, `minPoolSize`). |
| **Prometheus Exposition** | Required external `django-prometheus` dependency and middleware. | Native Prometheus format endpoint (`/metrics`) built directly into core service. |
| **Degraded State Handling** | Unhandled DB disconnect caused 500 Server Error crashes on views. | Graceful 503 Service Unavailable with structured JSON detailing failed component. |

---

## 5. Operational Runbook: Diagnosing Degradation

1. **Verify detailed system state (requires METRICS_TOKEN)**:
   ```bash
   curl -s -H "x-metrics-token: $METRICS_TOKEN" http://127.0.0.1:4000/health/detailed | jq .
   ```
2. **Inspect event loop lag**:
   - If `event_loop_lag_ms > 50ms`, investigate synchronous computations (large JSON serialization or unindexed database queries).
3. **Inspect memory consumption**:
   - If `heap_used_bytes > 400MB`, investigate potential memory leaks or unclosed streams.
4. **Scrape Prometheus metrics**:
   ```bash
   curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:4000/metrics
   ```

