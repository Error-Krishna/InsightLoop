# InsightLoop Django vs. Node.js Full-Codebase Endpoint Parity Audit

This document establishes the line-by-line parity audit between the legacy Python Django backend and the migrated TypeScript Node.js Express backend. Every Django and Node source citation is verified against physical source code on disk. Rows without direct Django equivalents are marked `UNVERIFIED (Node-only extension)` or `UNVERIFIED (Client-side implementation)`.

---

## 1. Authentication Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/auth/login/` | POST | `landing/api_views.py:LoginApiView.post` | `apps/api/src/modules/auth/auth.controller.ts:login` | `{ email, password }` | 200 (400/401 on err) | `{ user, tokens: { access, refresh } }` | Identical token signing, password hashing (PBKDF2 SHA256 600,000 iterations), and company scoping. |
| `/api/v1/auth/signup/` | POST | `landing/api_views.py:SignupApiView.post` | `apps/api/src/modules/auth/auth.controller.ts:signup` | `{ name, email, password, company_name }` | 201 (400 on dup) | `{ user, tokens: { access, refresh } }` | Atomic creation, unique index on `email`, cleans up company on race condition, returns 400 "Email already registered." |
| `/api/v1/auth/google/` | POST | `landing/api_views.py:GoogleLoginApiView.post` | `apps/api/src/modules/auth/auth.controller.ts:google` | `{ credential }` or `{ id_token }` | 200 (401 on bad aud) | `{ user, tokens: { access, refresh } }` | Verifies audience matching `GOOGLE_CLIENT_ID`, requires email verification, creates compatible random PBKDF2 password. |
| `/api/v1/auth/refresh/` | POST | `landing/auth_urls.py:CsrfExemptTokenRefreshView` | `apps/api/src/modules/auth/auth.controller.ts:refresh` | `{ refresh }` | 200 (401 on expired) | `{ access }` | Non-rotating SimpleJWT default; returns 401 "Token is invalid or expired" with `code: token_not_valid`. |

---

## 2. Dashboard Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/dashboard/overview/` | GET | `dashboard/api_views.py:DashboardOverviewApiView.get` | `apps/api/src/modules/dashboard/dashboard.controller.ts:getOverview` | None | 200 | Aggregated dashboard object | Aggregated overview data matching Django DashboardOverviewApiView response. |
| `/api/v1/dashboard/summary/` | GET | `dashboard/api_views.py:DashboardSummaryApiView.get` | `apps/api/src/modules/dashboard/dashboard.controller.ts:getSummary` | None | 200 | `{ total_revenue, total_profit, ... }` | Returns summary metrics with banker's rounding on percentage changes. |
| `/api/v1/dashboard/rev-exp/` | GET | `dashboard/api_views.py:RevenueExpenseApiView.get` | `apps/api/src/modules/dashboard/dashboard.controller.ts:getRevExp` | `query: { months? }` | 200 | `{ labels, revenue, expenses }` | Aggregates revenue and expenses over specified month window using Asia/Kolkata timezone. |
| `/api/v1/dashboard/profit-trends/` | GET | `dashboard/api_views.py:ProfitTrendsApiView.get` | `apps/api/src/modules/dashboard/dashboard.controller.ts:getProfitTrends` | `query: { months?, interval? }` | 200 | `{ labels, profit }` | Monthly/weekly profit trend metrics. |
| `/api/v1/dashboard/workers/` | GET | `dashboard/api_views.py:WorkerPaymentsApiView.get` | `apps/api/src/modules/dashboard/dashboard.controller.ts:getWorkers` | None | 200 | `{ workers: [...] }` | Recent worker payments with fallback to "Deleted Worker" for orphaned records. |
| `/api/v1/dashboard/top-workers/` | GET | `dashboard/api_views.py:TopWorkersApiView.get` | `apps/api/src/modules/dashboard/dashboard.controller.ts:getTopWorkers` | None | 200 | `{ workers: [...] }` | Top workers aggregation grouped by worker ID, lookup against workers collection. |
| `/api/v1/dashboard/export/:type/` | GET | `dashboard/utils.py:generate_export_file` | `apps/api/src/modules/dashboard/dashboard.controller.ts:exportReport` | `params: { type }` | 200 | `{ file_url }` | Generates CSV export (business_trends, worker_management, salary_payments, complete_analytics) via StorageService into /media/exports/. |

---

## 3. Bills Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/bills/` | GET | `bills/views.py:BillViewSet.list` | `apps/api/src/modules/bills/bills.controller.ts:listBills` | `query: { type? }` | 200 | `[Bill, ...]` | Naive ISO timestamps formatted via `formatDjangoIso` without trailing `Z`. |
| `/api/v1/bills/` | POST | UNVERIFIED (Node-only convenience endpoint) | `apps/api/src/modules/bills/bills.controller.ts:createBill` | `{ bill_type, products, buyer, ... }` | 201 | Bill object | Delegates to createKacha or createPakka based on bill_type; atomic stock deduction. |
| `/api/v1/bills/kacha/` | POST | `bills/views.py:BillViewSet.create_kacha` | `apps/api/src/modules/bills/bills.controller.ts:createKacha` | `{ products, buyer, ... }` | 201 | Bill object | Kacha bill creation; GST forced to 0. |
| `/api/v1/bills/pakka/` | POST | `bills/views.py:BillViewSet.create_pakka` | `apps/api/src/modules/bills/bills.controller.ts:createPakka` | `{ products, buyer, ... }` | 201 | Bill object | Pakka bill creation; enforces GST compliance. |
| `/api/v1/bills/:id/` | GET | `bills/views.py:BillViewSet.retrieve` | `apps/api/src/modules/bills/bills.controller.ts:getBill` | `params: { id }` | 200 | Bill object | Includes derived metrics (delivery status, payment status, costs). |
| `/api/v1/bills/:id/` | PUT | `bills/views.py:BillViewSet.update` | `apps/api/src/modules/bills/bills.controller.ts:updateBill` | `params: { id }, body: BillInput` | 200 | Bill object | Stock reconciliation (`_reconcile_stock_on_update`); blocks direct type flipping; pakka GST field preservation. |
| `/api/v1/bills/:id/` | DELETE | `bills/views.py:BillViewSet.destroy` | `apps/api/src/modules/bills/bills.controller.ts:deleteBill` | `params: { id }` | 204 | Empty | Restores inventory stock for all linked products upon deletion. |
| `/api/v1/bills/:id/convert/` | POST | `bills/views.py:BillViewSet.convert` | `apps/api/src/modules/bills/bills.controller.ts:convertToPakka` | `params: { id }, body: { gst_number, gst_percentage? }` | 200 | Bill object | Issues fresh pakka invoice number with retry resync. |
| `/api/v1/bills/:id/record-payment/` | POST | `bills/views.py:BillViewSet.record_payment` | `apps/api/src/modules/bills/bills.controller.ts:recordPayment` | `{ amount, date?, notes? }` | 200 | Bill object | Appends payment record, recalculates balances. |
| `/api/v1/bills/:id/profit-preview/`| GET | `bills/views.py:BillViewSet.profit_preview` | `apps/api/src/modules/bills/bills.controller.ts:getProfitPreview` | `params: { id }` | 200 | `{ suggested_profit, ... }` | Derives profit based on materials, pay records, and expenses. |
| `/api/v1/bills/:id/confirm-profit/`| POST | `bills/views.py:BillViewSet.confirm_profit` | `apps/api/src/modules/bills/bills.controller.ts:confirmProfit` | `{ confirmed_amount? }` | 200 | Bill object | Freezes suggested or overridden profit amount. |
| `/api/v1/bills/:id/reopen-profit/` | POST | `bills/views.py:BillViewSet.reopen_profit` | `apps/api/src/modules/bills/bills.controller.ts:reopenProfit` | `params: { id }` | 200 | Bill object | Unfreezes confirmed profit for recalculation. |
| `/api/v1/bills/:id/transportation-cost/` | POST | `bills/views.py:BillViewSet.add_transportation_cost` | `apps/api/src/modules/bills/bills.controller.ts:addTransportationCost` | `{ amount, date?, notes? }` | 200 | Bill object | Appends transportation expense item. |
| `/api/v1/bills/:id/misc-cost/` | POST | `bills/views.py:BillViewSet.add_misc_cost` | `apps/api/src/modules/bills/bills.controller.ts:addMiscCost` | `{ amount, date?, notes? }` | 200 | Bill object | Appends miscellaneous expense item. |
| `/api/v1/bills/:id/ready-to-deliver/` | POST | `bills/views.py:BillViewSet.add_ready_to_deliver` | `apps/api/src/modules/bills/bills.controller.ts:addReadyToDeliver` | `{ quantity, item_name?, date?, notes? }` | 200 | Bill object | Tracks staging fulfillment before shipment. |
| `/api/v1/bills/:id/confirm-shipment/` | POST | `bills/views.py:BillViewSet.confirm_shipment` | `apps/api/src/modules/bills/bills.controller.ts:confirmShipment` | `params: { id }` | 200 | Bill object | Confirms shipment and sets `shipment_confirmed: true`. |
| `/api/v1/bills/:id/assignments/` | GET | `bills/views.py:BillViewSet.assignments` | `apps/api/src/modules/bills/bills.controller.ts:getBillAssignments` | `params: { id }` | 200 | `[Assignment, ...]` | Retrieves worker assignments linked to bill. |
| `/api/v1/bills/:id/pdf/` | GET | `bills/views.py:BillViewSet.pdf` | UNVERIFIED (Client-side implementation) | `params: { id }` | 200 | Binary `application/pdf` | PDF invoice generation handled via client-side jsPDF in React frontend. |
| `/api/v1/bills/:id/share-whatsapp/` | POST | `bills/views.py:BillViewSet.share_whatsapp` | UNVERIFIED (Client-side implementation) | `params: { id }` | 200 | `{ success, url }` | WhatsApp sharing link payload handled via wa.me URL intent in frontend. |

---

## 4. Inventory Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/inventory/warehouses/` | GET | `inventory/views.py:WarehouseViewSet.list` | `apps/api/src/modules/inventory/inventory.controller.ts:listWarehouses` | None | 200 | `[Warehouse, ...]` | List company warehouses. |
| `/api/v1/inventory/warehouses/` | POST | `inventory/views.py:WarehouseViewSet.create` | `apps/api/src/modules/inventory/inventory.controller.ts:createWarehouse` | `{ name, location? }` | 201 | Warehouse object | Warehouse creation. |
| `/api/v1/inventory/warehouses/:id/` | PUT | `inventory/views.py:WarehouseViewSet.update` | `apps/api/src/modules/inventory/inventory.controller.ts:updateWarehouse` | `{ name?, location? }` | 200 | Warehouse object | Warehouse update. |
| `/api/v1/inventory/warehouses/:id/` | DELETE | `inventory/views.py:WarehouseViewSet.destroy` | `apps/api/src/modules/inventory/inventory.controller.ts:deleteWarehouse` | `params: { id }` | 204 | Empty | Warehouse deletion. |
| `/api/v1/inventory/meta/warehouse-summary/` | GET | `inventory/views.py:InventoryMetaViewSet.warehouse_summary` | `apps/api/src/modules/inventory/inventory.controller.ts:getWarehouseSummary` | None | 200 | `{ total_warehouses, ... }` | Aggregated warehouse summary. |
| `/api/v1/inventory/warehouse-summary/` | GET | `inventory/views.py:InventoryMetaViewSet.warehouse_summary` | `apps/api/src/modules/inventory/inventory.controller.ts:getWarehouseSummary` | None | 200 | `{ total_warehouses, ... }` | Direct alias for warehouse summary. |
| `/api/v1/inventory/finished/` | GET | `inventory/views.py:FinishedInventoryViewSet.list` | `apps/api/src/modules/inventory/inventory.controller.ts:listFinished` | None | 200 | `[InventoryItem, ...]` | Lists finished goods items. |
| `/api/v1/inventory/finished/` | POST | `inventory/views.py:FinishedInventoryViewSet.create` | `apps/api/src/modules/inventory/inventory.controller.ts:createFinished` | `{ name, quantity, ... }` | 201 | InventoryItem object | Auto-generates SKU `SKU-XXXXX` with atomic sequence generator. |
| `/api/v1/inventory/finished/:id/` | PUT | `inventory/views.py:FinishedInventoryViewSet.update` | `apps/api/src/modules/inventory/inventory.controller.ts:updateFinished` | `params: { id }` | 200 | InventoryItem object | Updates finished item. |
| `/api/v1/inventory/finished/:id/` | DELETE | `inventory/views.py:FinishedInventoryViewSet.destroy` | `apps/api/src/modules/inventory/inventory.controller.ts:deleteFinished` | `params: { id }` | 204 | Empty | Deletes finished item. |
| `/api/v1/inventory/semi-finished/` | GET | `inventory/views.py:SemiFinishedInventoryViewSet.list` | `apps/api/src/modules/inventory/inventory.controller.ts:listSemiFinished` | None | 200 | `[InventoryItem, ...]` | Lists semi-finished items. |
| `/api/v1/inventory/semi-finished/` | POST | `inventory/views.py:SemiFinishedInventoryViewSet.create` | `apps/api/src/modules/inventory/inventory.controller.ts:createSemiFinished` | `{ name, quantity, ... }` | 201 | InventoryItem object | Creates semi-finished item. |
| `/api/v1/inventory/semi-finished/:id/` | PUT | `inventory/views.py:SemiFinishedInventoryViewSet.update` | `apps/api/src/modules/inventory/inventory.controller.ts:updateSemiFinished` | `params: { id }` | 200 | InventoryItem object | Updates semi-finished item. |
| `/api/v1/inventory/semi-finished/:id/` | DELETE | `inventory/views.py:SemiFinishedInventoryViewSet.destroy` | `apps/api/src/modules/inventory/inventory.controller.ts:deleteSemiFinished` | `params: { id }` | 204 | Empty | Deletes semi-finished item. |
| `/api/v1/inventory/semi-finished/live/`| GET | `inventory/views.py:SemiFinishedInventoryViewSet.live` | `apps/api/src/modules/inventory/inventory.controller.ts:getLiveSemiFinished` | None | 200 | `{ open_assignments, ... }` | Live in-progress production floor tracking. |
| `/api/v1/inventory/raw/` | GET | `inventory/views.py:RawInventoryViewSet.list` | `apps/api/src/modules/inventory/inventory.controller.ts:listRaw` | None | 200 | `[InventoryItem, ...]` | Lists raw material items. |
| `/api/v1/inventory/raw/` | POST | `inventory/views.py:RawInventoryViewSet.create` | `apps/api/src/modules/inventory/inventory.controller.ts:createRaw` | `{ name, quantity, ... }` | 201 | InventoryItem object | Creates raw material item. |
| `/api/v1/inventory/raw/:id/` | PUT | `inventory/views.py:RawInventoryViewSet.update` | `apps/api/src/modules/inventory/inventory.controller.ts:updateRaw` | `params: { id }` | 200 | InventoryItem object | Updates raw material item. |
| `/api/v1/inventory/raw/:id/` | DELETE | `inventory/views.py:RawInventoryViewSet.destroy` | `apps/api/src/modules/inventory/inventory.controller.ts:deleteRaw` | `params: { id }` | 204 | Empty | Deletes raw material item. |

---

## 5. Workers Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/workers/` | GET | `worker/api_views.py:WorkersCollectionApiView.get` | `apps/api/src/modules/workers/workers.controller.ts:listWorkers` | None | 200 | `[Worker, ...]` | Lists active workers. |
| `/api/v1/workers/` | POST | `worker/api_views.py:WorkersCollectionApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:createWorker` | `{ name, phone?, ... }` | 201 | Worker object | Creates new worker; defaults age to null matching Django. |
| `/api/v1/workers/:id/` | GET | `worker/api_views.py:WorkerDetailApiView.get` | `apps/api/src/modules/workers/workers.controller.ts:getWorker` | `params: { id }` | 200 | Worker object | Worker detail. |
| `/api/v1/workers/:id/` | PUT | `worker/api_views.py:WorkerDetailApiView.put` | `apps/api/src/modules/workers/workers.controller.ts:updateWorker` | `params: { id }, body` | 200 | Worker object | Worker update. |
| `/api/v1/workers/:id/` | DELETE | `worker/api_views.py:WorkerDetailApiView.delete` | `apps/api/src/modules/workers/workers.controller.ts:deleteWorker` | `params: { id }` | 204 | Empty | Soft-deletes worker (`is_active: false`); cascades cleanup of open assignments/payments. |
| `/api/v1/workers/:id/materials/` | GET | `worker/api_views.py:WorkerMaterialsApiView.get` | `apps/api/src/modules/workers/workers.controller.ts:listMaterials` | `params: { id }` | 200 | `[Assignment, ...]` | Lists worker material assignments. |
| `/api/v1/workers/:id/materials/` | POST | `worker/api_views.py:WorkerMaterialsApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:createMaterial` | `{ material_name, quantity, price_per_unit, ... }` | 201 | Assignment object | Creates assignment with strict document shape (`worker` ObjectId reference, omitting extraneous `worker_id`). |
| `/api/v1/workers/:id/payments/` | GET | `worker/api_views.py:WorkerPaymentsApiView.get` | `apps/api/src/modules/workers/workers.controller.ts:listPayments` | `params: { id }` | 200 | `[PayRecord, ...]` | Lists worker pay records. |
| `/api/v1/workers/:id/payments/` | POST | `worker/api_views.py:WorkerPaymentsApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:createPayment` | `{ product_name, units_produced, rate_per_unit, ... }` | 201 | PayRecord object | Records payout to worker. |
| `/api/v1/workers/materials/:id/batches/` | POST | `worker/api_views.py:MaterialBatchApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:addBatch` | `{ quantity }` | 200 | Assignment object | Adds batch progress to open assignment with ISO timestamp. |
| `/api/v1/workers/materials/:id/complete/` | POST | `worker/api_views.py:MaterialCompleteApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:completeAssignment` | None | 200 | Assignment object | Closes assignment, syncs/creates finished goods inventory item with unique auto-generated SKU. |
| `/api/v1/workers/payments/:id/mark-paid/` | POST | `worker/api_views.py:MarkPaidApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:markPaymentPaid` | None | 200 | PayRecord object | Marks payment fully paid; idempotent if already paid. |
| `/api/v1/workers/payments/:id/record-payment/` | POST | `worker/api_views.py:RecordPartialPaymentApiView.post` | `apps/api/src/modules/workers/workers.controller.ts:recordPartialPayment` | `{ amount }` | 200 | PayRecord object | Records incremental payment towards pay record balance; rejects amounts exceeding total owed. |

---

## 6. Upload Module

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/upload/csv/` | POST | `upload/api_views.py:CsvUploadApiView.post` | `apps/api/src/modules/upload/upload.controller.ts:csvUpload` | Multipart file | 200 (400 on err) | `{ created, warnings }` | BOM stripping, CRLF/LF support, partial row import with warnings, negative numeric validation, 10k row cap. |
| `/api/v1/upload/manual/` | POST | `upload/api_views.py:ManualUploadApiView.post` | `apps/api/src/modules/upload/upload.controller.ts:manualUpload` | Record body | 201 | BusinessData object | Manual record upload, triggers financial summary recalculation. |

---

## 7. Insights, Profile & Contact Modules

| Endpoint | Method | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/insights/` | GET | `insights/api_views.py:InsightsListApiView.get` | `apps/api/src/modules/insights/insights.controller.ts:listInsights` | None | 200 | `[Insight, ...]` | Profit metrics, product breakdowns, customer segmentation. |
| `/api/v1/insights/analyze/` | POST | `insights/api_views.py:InsightsAnalyzeApiView.post` | `apps/api/src/modules/insights/insights.controller.ts:analyze` | None | 200 | `{ count, insights }` | Generates insights by analyzing company sales data. |
| `/api/v1/insights/:id/` | DELETE | `insights/api_views.py:InsightDetailApiView.delete` | `apps/api/src/modules/insights/insights.controller.ts:deleteInsight` | `params: { id }` | 204 | Empty | Deletes specified insight document. |
| `/api/v1/insights/:id/export/` | GET | `insights/api_views.py:InsightExportApiView.get` | `apps/api/src/modules/insights/insights.controller.ts:exportInsight` | `params: { id }` | 200 | CSV attachment | Streams CSV export of insight metrics and data points. |
| `/api/v1/profile/` | GET | `misc/api_views.py:ProfileApiView.get` | `apps/api/src/modules/profile/profile.controller.ts:getProfile` | None | 200 | Profile object | Returns user and company metadata. |
| `/api/v1/profile/` | PUT | `misc/api_views.py:ProfileApiView.put` | `apps/api/src/modules/profile/profile.controller.ts:updateProfile` | Body / Multipart | 200 | Profile object | Updates company settings, branding logos, stamps, signatures via StorageService. |
| `/api/v1/profile/settings/` | GET | `misc/api_views.py:WorkspaceSettingsApiView.get` | `apps/api/src/modules/profile/profile.controller.ts:getSettings` | None | 200 | Settings object | Returns workspace feature flags and user notification preferences. |
| `/api/v1/profile/settings/` | PUT | `misc/api_views.py:WorkspaceSettingsApiView.put` | `apps/api/src/modules/profile/profile.controller.ts:updateSettings` | Body | 200 | Settings object | Updates workspace feature flags and notification preferences. |
| `/contact` | POST | `landing/views.py:contact_view` | `apps/api/src/modules/contact/contact.controller.ts:submit` | `{ name, email, message }` | 200 | `{ status: "ok" }` | CSRF verification, SMTP email notification, and MongoDB contact_message logging. |
| `/api/v1/contact/` | POST | `landing/views.py:contact_view` | `apps/api/src/modules/contact/contact.controller.ts:submit` | `{ name, email, message }` | 200 | `{ status: "ok" }` | JSON API contact submission, SMTP notification, and database persistence. |

---

## 8. AI Assistant & WebSocket Gateway

| Endpoint / Channel | Method / Protocol | Django Source Path & Function | Node Source Path & Function | Parameters | Status Code | Response Shape Parity | Notes / Parity Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/ai/config/` | GET | `aiexport/api_views.py:AIConfigApiView.get` | `apps/api/src/modules/ai/ai.controller.ts:getConfig` | None | 200 | `{ websocket_path, starter_prompts }` | Configuration for frontend AI chat widget. |
| `/api/v1/ai/command/` | POST | `aiexport/api_views.py:AICommandApiView.post` | `apps/api/src/modules/ai/ai.controller.ts:processCommand` | `{ command, assistant? }` | 200 | AI response object | HTTP fallback for AI commands; triggers report exports and navigation intents. |
| `ws/dashboard/<company_id>/` | WebSocket | `dashboard/consumers.py:DashboardConsumer` | `apps/api/src/ws/gateway.ts:setupWebSocketGateway` | Query token or header | WS 101 | Direct JSON framing | Close code 4001 on cross-tenant / unauthorized; live financial broadcast. |
| `ws/ai-assistant/` | WebSocket | `aiexport/consumers.py:AIAssistantConsumer` | `apps/api/src/ws/gateway.ts:setupWebSocketGateway` | Query token or deferred message | WS 101 | Chat response framing | Close code 4001 on expired/invalid auth; streams real-time AI assistance. |

---

## 9. Performance & Query Optimization (N+1 Elimination)

- **AI Worker Performance Analytics (`AiService.getInsightData`)**:
  - *Django*: Iterated over worker objects and performed separate queries.
  - *Node Initial*: Iterated over workers executing `findWorkerPayRecords` and `findWorkerMaterials` per worker ($2N + 1$ queries).
  - *Node Optimized*: Batches all active worker IDs into 2 parallel `$in` queries (`findBatchWorkerPayRecords`, `findBatchWorkerMaterials`), mapping in-memory in O(1) time. Total database roundtrips reduced from $2N + 1$ to exactly $3$ queries total.
