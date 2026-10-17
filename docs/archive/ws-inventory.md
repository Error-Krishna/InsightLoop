# WebSocket Architecture & Channel Inventory

This document details the complete WebSocket infrastructure of InsightLoop, including ASGI routing, consumers, authentication flows, channel layer groups, broadcast triggers, and frontend client consumption.

---

## 1. WebSocket Routing & Gateways

All WebSockets are served on the same host and port as the HTTP server.

| Route Pattern | Consumer Class | Auth Flow | Group Name | Close Codes |
| :--- | :--- | :--- | :--- | :--- |
| `ws/dashboard/(?P<company_id>[^/]+)/$` | `DashboardConsumer` (`dashboard/consumers.py`) | Query param `?token=<jwt>` (Strict: closed immediately with 4001 if missing/invalid) | `dashboard_<company_id>` | **4001**: Auth failure / missing token / user not found <br> **4002**: Internal server error |
| `ws/ai-assistant/$` | `AIAssistantConsumer` (`aiexport/consumers.py`) | Dual mode: Query param `?token=<jwt>` OR first JSON message `{token: "<jwt>"}` | `ai_assistant_<company_id>` | **4001**: Invalid/expired token received in first message |

---

## 2. Consumer Specifications

### 2.1 Dashboard Consumer (`DashboardConsumer`)
- **Connection Handshake**:
  1. Reads `?token=<jwt>` from query string. If missing, closes with code `4001`.
  2. Verifies `AccessToken(token)`. If invalid or expired, closes with code `4001`.
  3. Extracts `email` claim from token.
  4. Looks up live `User` record in MongoDB by `email`. Resolves `company_id = str(user.company.company_id)`.
     *(Security design: Does NOT trust `company_id` claim in token; verifies against live DB record).*
  5. If user not found, closes with `4001`.
  6. Subscribes channel to group `dashboard_{company_id}`.
  7. Accepts connection.
  8. Fetches initial full snapshot via `get_dashboard_data(company_id)` and immediately sends it over the socket.
- **Initial Snapshot Payload**:
  ```json
  {
    "summary": {
      "total_revenue": 125000.50,
      "total_profit": 45000.20,
      "worker_payments": 15000.00,
      "breakdown": {
        "bills": { "revenue": 100000.00, "profit": 35000.00 },
        "uploaded_data": { "revenue": 25000.50, "profit": 10000.20 }
      },
      "active_workers": 12,
      "revenue_change": 14.5,
      "profit_change": 8.2,
      "workers_change": 0.0
    },
    "revExp": {
      "labels": ["May 2026", "Jun 2026", "Jul 2026"],
      "revenue": [30000, 45000, 50000],
      "expenses": [20000, 31000, 34000]
    },
    "profitTrends": {
      "labels": ["May 2026", "Jun 2026", "Jul 2026"],
      "profit": [10000, 14000, 16000],
      "interval": "monthly"
    },
    "workers": [
      { "id": "6a66f1d9...", "name": "Ramesh Kumar", "amount": 8500.0 }
    ],
    "topWorkers": [
      { "id": "6a66f1d9...", "name": "Ramesh Kumar", "amount": 8500.0 }
    ],
    "billsCount": 18
  }
  ```
- **Live Event Handling**:
  - Event type: `dashboard.update` (mapped to method `dashboard_update`).
  - Broadcasts `{ "data": <updated_dashboard_data> }` down to the client.
- **Disconnection**:
  - Discards channel from `dashboard_{company_id}`.

### 2.2 AI Assistant Consumer (`AIAssistantConsumer`)
- **Connection Handshake**:
  1. Accepts connection unconditionally upon socket open.
  2. Inspects `?token=` in query string:
     - If valid JWT present: extracts `company_id` and `email` from token claims; joins group `ai_assistant_{company_id}`; sets `authenticated = True`.
     - If absent: leaves `authenticated = False`.
  3. Sends status message to client:
     ```json
     {
       "type": "session_status",
       "authenticated": false,
       "message": "Connected to AI Assistant"
     }
     ```
- **First Message Authentication Flow**:
  - If unauthenticated, first message must be: `{"token": "<jwt>"}`.
  - If valid: extracts `company_id` & `email`, joins `ai_assistant_{company_id}`, sends `{"type": "session_status", "authenticated": true}`.
  - If invalid/expired: sends `{"type": "error", "content": "Invalid or expired token."}` and closes socket with code `4001`.
- **Command Handling Flow**:
  - Client sends:
    ```json
    {
      "command": "Export business trends",
      "assistant": "jarvis"
    }
    ```
  - Consumer delegates to `process_ai_command(company_id, user_email, command, assistant_type)`.
  - Dispatches result to channel group:
    ```python
    await self.channel_layer.group_send(
        self.group_name,
        {"type": "ai_response", "response": response_data, "assistant": assistant_type}
    )
    ```
  - Event handler `ai_response` serializes `event["response"]` and pushes to the client socket.
- **Response Payloads**:
  - *Download action*:
    ```json
    {
      "assistant": "jarvis",
      "timestamp": "2026-10-15T02:30:00.000",
      "action": "download",
      "file_url": "/media/exports/313fd1a8.../business_trends_20261015.csv",
      "message": "Your business trends export is ready!"
    }
    ```
  - *Navigate action*:
    ```json
    {
      "assistant": "jarvis",
      "timestamp": "2026-10-15T02:30:00.000",
      "action": "navigate",
      "url": "/dashboard"
    }
    ```
  - *Display action*:
    ```json
    {
      "assistant": "jarvis",
      "timestamp": "2026-10-15T02:30:00.000",
      "action": "display",
      "content": "{\"type\": \"revenue_trends\", \"data\": {...}}"
    }
    ```
  - *Message action*:
    ```json
    {
      "assistant": "jarvis",
      "timestamp": "2026-10-15T02:30:00.000",
      "action": "message",
      "content": "Please specify what to export..."
    }
    ```

---

## 3. Channel Layer & `group_send` Call Sites

| Call Site File & Line | Trigger Condition | Target Group | Event Type & Payload |
| :--- | :--- | :--- | :--- |
| `insightloop/dashboard/utils.py:144` (`broadcast_update`) | Called when data updates (e.g. data ingestion / sync) | `dashboard_{company_id}` | `{"type": "dashboard.update", "data": get_dashboard_data(company_id)}` |
| `insightloop/aiexport/consumers.py:106` | After `process_ai_command` completes | `ai_assistant_{company_id}` | `{"type": "ai_response", "response": response_data, "assistant": assistant_type}` |

*Note on Approved Fix #4*: In Django's `AIAssistantConsumer`, responses are broadcast to the entire company group `ai_assistant_{company_id}`, rather than sent back strictly to the connection that asked. Fix #4 proposes scoping AI responses directly to the requesting client socket.

---

## 4. Frontend Client Integration

### 4.1 URL Resolution (`frontend/src/lib/ws.js`)
```javascript
export function buildWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = import.meta.env.VITE_WS_BASE_URL || `${proto}//${window.location.host}`;
  return `${base}${path}`;
}
```

### 4.2 Dashboard Consumer (`DashboardPage.jsx`)
- Connects to: `buildWsUrl("/ws/dashboard/" + companyId + "/?token=" + token)`.
- Updates React state directly from incoming frames:
  ```javascript
  setData((prev) => ({
    ...prev,
    summary: payload.summary ?? prev.summary,
    revExp: payload.revExp ?? prev.revExp,
    profitTrends: payload.profitTrends ?? prev.profitTrends,
    workers: Array.isArray(payload.workers) ? payload.workers : prev.workers,
    topWorkers: Array.isArray(payload.topWorkers) ? payload.topWorkers : prev.topWorkers,
    billsCount: payload.billsCount ?? prev.billsCount,
  }));
  ```

### 4.3 AI Assistant Consumer (`ChatPage.jsx`)
- Connects to: `buildWsUrl("/ws/ai-assistant/?token=" + token)`.
- Filters out `"session_status"` frames: `if (payload.type === "session_status") return;`.
- Handles `action === "navigate"` by invoking `navigate(payload.url)`.
- Handles `action === "download"` by invoking `window.open(payload.file_url, "_blank")`.
- Dispatches user commands: `socket.send(JSON.stringify({ command, assistant: "jarvis" }))`.
