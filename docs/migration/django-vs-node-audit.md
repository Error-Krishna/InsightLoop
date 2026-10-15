# InsightLoop Django vs. Node.js Full-Codebase Endpoint Parity Audit

This document establishes the line-by-line parity audit between the legacy Python Django backend and the migrated TypeScript Node.js Express backend.

---

## 1. Authentication Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/auth/login/` | POST | `landing/api_views.py:ApiLoginView.post` | `apps/api/src/modules/auth/auth.controller.ts:login` | `{ email, password }` | 200 (400/401 on err) | `{ user, tokens: { access, refresh } }` | Identical token signing, password hashing (PBKDF2 SHA256 600,000 iterations), and company scoping. |
| `/api/v1/auth/signup/` | POST | `landing/api_views.py:ApiSignupView.post` | `apps/api/src/modules/auth/auth.controller.ts:signup` | `{ name, email, password, company_name }` | 201 (400 on dup) | `{ user, tokens: { access, refresh } }` | Atomic creation, unique index on `email`, cleans up company on race condition, returns 400 "Email already registered." |
| `/api/v1/auth/google/` | POST | `landing/api_views.py:GoogleLoginApiView.post` | `apps/api/src/modules/auth/auth.controller.ts:google` | `{ credential }` or `{ id_token }` | 200 (401 on bad aud) | `{ user, tokens: { access, refresh } }` | Verifies audience matching `GOOGLE_CLIENT_ID`, requires email verification, creates compatible random PBKDF2 password. |
| `/api/v1/auth/refresh/` | POST | SimpleJWT `TokenRefreshView` | `apps/api/src/modules/auth/auth.controller.ts:refresh` | `{ refresh }` | 200 (401 on expired) | `{ access }` | Non-rotating SimpleJWT default; returns 401 "Token is invalid or expired" with `code: token_not_valid`. |

---

## 2. Dashboard Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/dashboard/` | GET | `dashboard/api_views.py:DashboardDataApiView.get` | `apps/api/src/modules/dashboard/dashboard.controller.ts:getDashboard` | `query: { start_date?, end_date? }` | 200 | Full dashboard payload | Uses `Asia/Kolkata` timezone operators for aggregations; top workers group by worker ID and lookup worker doc; deleted worker fallback handled. |
| `/api/v1/dashboard/metrics/` | GET | `dashboard/api_views.py:DashboardMetricsApiView.get` | `apps/api/src/modules/dashboard/dashboard.controller.ts:getMetrics` | None | 200 | `{ metrics: [...] }` | Banker's rounding via `roundPy` for percentage changes. |

---

## 3. Bills Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/bills/` | GET | `bills/views.py:BillViewSet.list` | `apps/api/src/modules/bills/bills.controller.ts:listBills` | `query: { type? }` | 200 | `[Bill, ...]` | Naive ISO timestamps formatted via `formatDjangoIso` without trailing `Z`. |
| `/api/v1/bills/` | POST | Node Express router | `apps/api/src/modules/bills/bills.controller.ts:createBill` | `{ bill_type, products, buyer, ... }` | 201 | Bill object | Generates invoice `INV-YYYY-XXXXX` with retry on collision; conditional stock decrement `{ quantity: { $gte: needed } }` with rollback on failure. |
| `/api/v1/bills/kacha/` | POST | `bills/views.py:BillViewSet.create_kacha` | `apps/api/src/modules/bills/bills.controller.ts:createKacha` | `{ products, buyer, ... }` | 201 | Bill object | Kacha bill creation; GST forced to 0. |
| `/api/v1/bills/pakka/` | POST | `bills/views.py:BillViewSet.create_pakka` | `apps/api/src/modules/bills/bills.controller.ts:createPakka` | `{ products, buyer, ... }` | 201 | Bill object | Pakka bill creation; enforces GST compliance. |
| `/api/v1/bills/:id/` | GET | `bills/views.py:BillViewSet.retrieve` | `apps/api/src/modules/bills/bills.controller.ts:getBill` | `params: { id }` | 200 | Bill object | Includes derived metrics (delivery status, payment status, costs). |
| `/api/v1/bills/:id/` | PUT | `bills/views.py:BillViewSet.update` | `apps/api/src/modules/bills/bills.controller.ts:updateBill` | `params: { id }, body: BillInput` | 200 | Bill object | Stock reconciliation (`_reconcile_stock_on_update`); blocks direct type flipping; pakka GST field preservation. |
| `/api/v1/bills/:id/` | DELETE | `bills/views.py:BillViewSet.destroy` | `apps/api/src/modules/bills/bills.controller.ts:deleteBill` | `params: { id }` | 204 | Empty | Restores inventory stock for all linked products upon deletion. |
| `/api/v1/bills/:id/convert/` | POST | `bills/views.py:BillViewSet.convert` | `apps/api/src/modules/bills/bills.controller.ts:convertToPakka` | `params: { id }, body: { gst_number, gst_percentage? }` | 200 | Bill object | Issues fresh pakka invoice number with retry resync. |
| `/api/v1/bills/:id/payments/` | POST | `bills/views.py:BillViewSet.record_payment` | `apps/api/src/modules/bills/bills.controller.ts:recordPayment` | `{ amount, date?, notes? }` | 200 | Bill object | Appends payment record, recalculates balances. |
| `/api/v1/bills/:id/profit-preview/`| GET | `bills/views.py:BillViewSet.profit_preview` | `apps/api/src/modules/bills/bills.controller.ts:profitPreview` | `params: { id }` | 200 | `{ suggested_profit, ... }` | Derives profit based on materials, pay records, and expenses. |
| `/api/v1/bills/:id/confirm-profit/`| POST | `bills/views.py:BillViewSet.confirm_profit` | `apps/api/src/modules/bills/bills.controller.ts:confirmProfit` | `{ confirmed_amount? }` | 200 | Bill object | Freezes suggested or overridden profit amount. |
| `/api/v1/bills/:id/reopen-profit/` | POST | `bills/views.py:BillViewSet.reopen_profit` | `apps/api/src/modules/bills/bills.controller.ts:reopenProfit` | `params: { id }` | 200 | Bill object | Unfreezes confirmed profit for recalculation. |
| `/api/v1/bills/:id/transportation-costs/` | POST | `bills/views.py:BillViewSet.add_transportation_cost` | `apps/api/src/modules/bills/bills.controller.ts:addTransportationCost` | `{ amount, date?, notes? }` | 200 | Bill object | Appends transportation expense item. |
| `/api/v1/bills/:id/misc-costs/` | POST | `bills/views.py:BillViewSet.add_misc_cost` | `apps/api/src/modules/bills/bills.controller.ts:addMiscCost` | `{ amount, date?, notes? }` | 200 | Bill object | Appends miscellaneous expense item. |
| `/api/v1/bills/:id/ready-to-deliver/` | POST | `bills/views.py:BillViewSet.add_ready_to_deliver` | `apps/api/src/modules/bills/bills.controller.ts:addReadyToDeliver` | `{ quantity, item_name?, date?, notes? }` | 200 | Bill object | Tracks staging fulfillment before shipment. |
| `/api/v1/bills/:id/confirm-shipment/` | POST | `bills/views.py:BillViewSet.confirm_shipment` | `apps/api/src/modules/bills/bills.controller.ts:confirmShipment` | `params: { id }` | 200 | Bill object | Confirms shipment and sets `shipment_confirmed: true`. |
| `/api/v1/bills/:id/assignments/` | GET | `bills/views.py:BillViewSet.assignments` | `apps/api/src/modules/bills/bills.controller.ts:getAssignments` | `params: { id }` | 200 | `[Assignment, ...]` | Retrieves worker assignments linked to bill. |
| `/api/v1/bills/:id/pdf/` | GET | `bills/views.py:BillViewSet.pdf` | `apps/api/src/modules/bills/bills.controller.ts:generatePdf` | `params: { id }` | 200 | Binary `application/pdf` | PDF invoice generation. |
| `/api/v1/bills/:id/share-whatsapp/` | POST | `bills/views.py:BillViewSet.share_whatsapp` | `apps/api/src/modules/bills/bills.controller.ts:shareWhatsapp` | `params: { id }` | 200 | `{ success, url }` | WhatsApp sharing link payload. |

---

## 4. Inventory Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/inventory/warehouses/` | GET | `inventory/views.py:WarehouseViewSet.list` | `apps/api/src/modules/inventory/inventory.controller.ts:listWarehouses` | None | 200 | `[Warehouse, ...]` | List company warehouses. |
| `/api/v1/inventory/warehouses/` | POST | `inventory/views.py:WarehouseViewSet.create` | `apps/api/src/modules/inventory/inventory.controller.ts:createWarehouse` | `{ name, location? }` | 201 | Warehouse object | Warehouse creation. |
| `/api/v1/inventory/warehouses/:id/` | PUT | `inventory/views.py:WarehouseViewSet.update` | `apps/api/src/modules/inventory/inventory.controller.ts:updateWarehouse` | `{ name?, location? }` | 200 | Warehouse object | Warehouse update. |
| `/api/v1/inventory/warehouses/:id/` | DELETE | `inventory/views.py:WarehouseViewSet.destroy` | `apps/api/src/modules/inventory/inventory.controller.ts:deleteWarehouse` | `params: { id }` | 204 | Empty | Warehouse deletion. |
| `/api/v1/inventory/warehouse-summary/` | GET | `inventory/views.py:WarehouseViewSet.summary` | `apps/api/src/modules/inventory/inventory.controller.ts:getWarehouseSummary` | None | 200 | `{ total_warehouses, ... }` | Aggregated warehouse summary. |
| `/api/v1/inventory/finished/` | GET | `inventory/views.py:FinishedInventoryViewSet.list` | `apps/api/src/modules/inventory/inventory.controller.ts:listFinished` | None | 200 | `[InventoryItem, ...]` | Lists finished goods items. |
| `/api/v1/inventory/finished/` | POST | `inventory/views.py:FinishedInventoryViewSet.create` | `apps/api/src/modules/inventory/inventory.controller.ts:createFinished` | `{ name, quantity, ... }` | 201 | InventoryItem object | Auto-generates SKU `SKU-XXXXX` with retry resync. |
| `/api/v1/inventory/semi-finished/` | GET | `inventory/views.py:SemiFinishedInventoryViewSet.list` | `apps/api/src/modules/inventory/inventory.controller.ts:listSemiFinished` | None | 200 | `[InventoryItem, ...]` | Lists semi-finished items. |
| `/api/v1/inventory/semi-finished/live/`| GET | `inventory/views.py:SemiFinishedInventoryViewSet.live` | `apps/api/src/modules/inventory/inventory.controller.ts:getLiveSemiFinished` | None | 200 | `{ open_assignments, ... }` | Live in-progress production floor tracking. |
| `/api/v1/inventory/raw/` | GET | `inventory/views.py:RawMaterialInventoryViewSet.list` | `apps/api/src/modules/inventory/inventory.controller.ts:listRaw` | None | 200 | `[InventoryItem, ...]` | Lists raw material items. |
| `/api/v1/inventory/raw/` | POST | `inventory/views.py:RawMaterialInventoryViewSet.create` | `apps/api/src/modules/inventory/inventory.controller.ts:createRaw` | `{ name, quantity, ... }` | 201 | InventoryItem object | Creates raw material item. |

---

## 5. Workers Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/workers/` | GET | `worker/api_views.py:WorkerListCreateApiView.get` | `apps/api/src/modules/workers/workers.controller.ts:listWorkers` | None | 200 | `[Worker, ...]` | Lists active workers. |
| `/api/v1/workers/` | POST | `worker/api_views.py:WorkerListCreateApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:createWorker` | `{ name, phone?, ... }` | 201 | Worker object | Creates new worker. |
| `/api/v1/workers/:id/` | GET | `worker/api_views.py:WorkerDetailApiView.get` | `apps/api/src/modules/workers/workers.controller.ts:getWorker` | `params: { id }` | 200 | Worker object | Worker detail. |
| `/api/v1/workers/:id/` | PUT | `worker/api_views.py:WorkerDetailApiView.put` | `apps/api/src/modules/workers/workers.controller.ts:updateWorker` | `params: { id }, body` | 200 | Worker object | Worker update. |
| `/api/v1/workers/:id/` | DELETE | `worker/api_views.py:WorkerDetailApiView.delete` | `apps/api/src/modules/workers/workers.controller.ts:deleteWorker` | `params: { id }` | 204 | Empty | Soft-deletes worker (`is_active: false`). |
| `/api/v1/workers/:id/materials/` | POST | `worker/api_views.py:WorkerMaterialCreateApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:createMaterial` | `{ material_name, quantity, price_per_unit, ... }` | 201 | Assignment object | Creates assignment with strict document shape (`worker` ObjectId reference, omitting extraneous `worker_id`). |
| `/api/v1/workers/:id/payments/` | POST | `worker/api_views.py:WorkerPaymentCreateApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:createPayment` | `{ product_name, units_produced, rate_per_unit, ... }` | 201 | PayRecord object | Records payout to worker. |
| `/api/v1/workers/assignments/:id/batch/` | POST | `worker/api_views.py:AssignmentAddBatchApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:addBatch` | `{ quantity }` | 200 | Assignment object | Adds batch progress to open assignment. |
| `/api/v1/workers/assignments/:id/complete/` | POST | `worker/api_views.py:AssignmentCompleteApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:completeAssignment` | None | 200 | Assignment object | Closes assignment, syncs/creates finished goods inventory item matching Django. |
| `/api/v1/workers/pay-records/:id/payments/` | POST | `worker/api_views.py:PayRecordAddPaymentApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:addPayRecordPayment` | `{ amount }` | 200 | PayRecord object | Records incremental payment towards pay record balance. |
| `/api/v1/workers/report/data/` | GET | `worker/api_views.py:WorkerReportDataApiView.get` | `apps/api/src/modules/workers/workers.controller.ts:getReportData` | None | 200 | Report object | Summarizes payroll and production per worker. |
| `/api/v1/workers/report/pdf/` | GET | `worker/api_views.py:WorkerReportPdfApiView.get` | `apps/api/src/modules/workers/workers.controller.ts:getReportPdf` | None | 200 | Binary `application/pdf` | PDF payroll report generation. |

---

## 6. Upload Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/upload/csv/` | POST | `upload/api_views.py:CsvUploadApiView.post` | `apps/api/src/modules/upload/upload.controller.ts:csvUpload` | Multipart file | 200 (400 on err) | `{ created, warnings }` | BOM stripping, CRLF/LF support, partial row import with warnings, negative numeric validation, 10k row cap. |
| `/api/v1/upload/manual/` | POST | `upload/api_views.py:ManualUploadApiView.post` | `apps/api/src/modules/upload/upload.controller.ts:manualUpload` | Record body | 201 | BusinessData object | Manual record upload, triggers financial summary recalculation. |

---

## 7. Insights, Profile & AI Modules

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/insights/` | GET | `insights/api_views.py:InsightsApiView.get` | `apps/api/src/modules/insights/insights.controller.ts:getInsights` | None | 200 | Full insights object | Profit metrics, product breakdowns, customer segmentation. |
| `/api/v1/profile/` | GET | `misc/api_views.py:ProfileApiView.get` | `apps/api/src/modules/profile/profile.controller.ts:getProfile` | None | 200 | Profile object | Returns user and company metadata. |
| `/api/v1/profile/` | PUT | `misc/api_views.py:ProfileApiView.put` | `apps/api/src/modules/profile/profile.controller.ts:updateProfile` | Body | 200 | Profile object | Updates company settings and branding. |
| `/api/v1/profile/contact/` | POST | `misc/api_views.py:ContactUsApiView.post` | `apps/api/src/modules/profile/profile.controller.ts:contactUs` | `{ name, email, message, subject? }` | 200 | `{ message: "..." }` | Inserts message into `contact_message` collection matching MongoEngine singular name. |
| `/api/v1/ai/config/` | GET | `aiexport/api_views.py:AiConfigApiView.get` | `apps/api/src/modules/ai/ai.controller.ts:getConfig` | None | 200 | `{ websocket_path, starter_prompts }` | Configuration for frontend AI chat widget. |
| `/api/v1/ai/insights/` | GET | `aiexport/api_views.py:AiInsightDataApiView.get` | `apps/api/src/modules/ai/ai.controller.ts:getInsightData` | `query: { type }` | 200 | Array of metrics | Batched queries via `$in` eliminating N+1 overhead. |
| `/api/v1/ai/command/` | POST | `aiexport/api_views.py:AiCommandApiView.post` | `apps/api/src/modules/ai/ai.controller.ts:processCommand` | `{ command, assistant? }` | 200 | AI response object | HTTP fallback for AI commands. |

---

## 8. WebSocket Channels

| Protocol & Path | Django Consumer | Node Implementation | Auth Mechanism | Close Codes | Framing Contract |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ws/dashboard/<company_id>/` | `dashboard/consumers.py:DashboardConsumer` | `apps/api/src/ws/gateway.ts` | Query `?token=<jwt>` or `Authorization: Bearer <jwt>` | 4001 on missing, expired, invalid, or cross-tenant URL | Direct JSON payload (initial snapshot + real-time updates). |
| `ws/ai-assistant/` | `aiexport/consumers.py:AIAssistantConsumer` | `apps/api/src/ws/gateway.ts` | Query `?token=<jwt>`, header, or deferred first message `{ token: <jwt> }` | 4001 on expired, invalid, or deactivated user | `{ type: "session_status", authenticated, message }`, `{ type: "error", content }`, response objects. |

---

## 9. Performance & Query Optimization (N+1 Elimination)

- **AI Worker Performance Analytics (`AiService.getInsightData`)**:
  - *Django*: Iterated over worker objects and performed separate queries.
  - *Node Initial*: Iterated over workers executing `findWorkerPayRecords` and `findWorkerMaterials` per worker ($2N + 1$ queries).
  - *Node Optimized*: Batches all active worker IDs into 2 parallel `$in` queries (`findBatchWorkerPayRecords`, `findBatchWorkerMaterials`), mapping in-memory in O(1) time. Total database roundtrips reduced from $2N + 1$ to exactly $3$ queries total.
