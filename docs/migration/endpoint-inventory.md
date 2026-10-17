# API Endpoint & Integration Inventory

This document catalogs every HTTP route, ViewSet action, internal and external side effect, and frontend consumption detail across InsightLoop.

---

## 1. Global API Conventions

- **Base URL Prefix**: `/api/v1/`
- **Trailing Slashes**: All routes in Django are defined with trailing slashes (e.g. `/api/v1/bills/`). Node/Express will accept both with and without trailing slash.
- **Authentication**: JWT Bearer token in `Authorization: Bearer <access_token>` header on all endpoints except `/api/v1/auth/*`.
- **Default Error Envelope**:
  - Current (DRF): `{"detail": "<message>"}` (or specific field dicts on validation errors).
  - Target (Node): `{ "detail": string, "code": "<MACHINE_CODE>", "errors"?: {...}, "requestId": string }`.
- **Data Serialization Conventions** (`insightloop/insightloop/api_utils.py`):
  - ObjectIds: 24-character hexadecimal string (`str(doc.id)`).
  - Decimals: Serialized as floating-point numbers (`float(val)`).
  - Dates & Datetimes: ISO 8601 strings (`val.isoformat()`).
  - Monetary values: Floats rounded to 2 decimal places (`round(val, 2)`).

---

## 2. Complete Endpoint Inventory Table

| Method | Path | Auth | Request Schema / Params | Response Schema / Status | Side Effects | DB Collections Touched | Frontend Caller(s) | Response Fields Read by Frontend |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/auth/signup/` | AllowAny | `{ name, email, password, company \| company_name }` | `201` `{ tokens: {access, refresh}, user: {id, name, email, company_id, company_name} }` <br> `400` `{"detail": "..."}` | Creates Company, creates User with hashed password, issues JWT pair | `company`, `user` | `SignupPage.jsx` | `tokens.access`, `tokens.refresh`, `user` (`id`, `name`, `email`, `company_id`, `company_name`) |
| **POST** | `/api/v1/auth/login/` | AllowAny | `{ email, password }` | `200` `{ tokens: {access, refresh}, user: {...} }` <br> `400` / `401` `{"detail": "..."}` | Verifies PBKDF2 hash, updates `last_login`, issues JWT pair | `user`, `company` | `LoginPage.jsx` | `tokens.access`, `tokens.refresh`, `user` |
| **POST** | `/api/v1/auth/google/` | AllowAny | `{ credential \| id_token }` | `200` `{ tokens: {...}, user: {...} }` <br> `400` / `401` / `502` | Calls Google tokeninfo API, checks `aud` & `email_verified`, find-or-creates Company + User, updates `last_login` | `user`, `company` | `GoogleSignInButton.jsx` | `tokens.access`, `tokens.refresh`, `user` |
| **POST** | `/api/v1/auth/refresh/` | AllowAny | `{ refresh: "<token>" }` | `200` `{"access": "<new_token>"}` <br> `401` `{"detail": "..."}` | Verifies refresh token signature and expiration | None | `lib/api.js` (Axios interceptor) | `access` |
| **GET** | `/api/v1/dashboard/overview/` | Bearer | Query: None | `200` `{ summary: {...}, revExp: {...}, profitTrends: {...}, workers: [...], topWorkers: [...], billsCount: int }` | Aggregates all dashboard metrics | `bills`, `business_data`, `pay_records`, `workers` | *Direct call in backend tests; frontend calls component endpoints below* | *(None directly in frontend; matches WS push)* |
| **GET** | `/api/v1/dashboard/summary/` | Bearer | Query: None | `200` `{ total_revenue, total_profit, worker_payments, breakdown, active_workers, revenue_change, profit_change, workers_change }` | Computes live metrics from confirmed bills, uploaded data, and paid worker wages vs previous month | `bills`, `business_data`, `pay_records`, `workers` | `DashboardPage.jsx` | `total_revenue`, `total_profit`, `active_workers`, `revenue_change`, `profit_change`, `workers_change` |
| **GET** | `/api/v1/dashboard/rev-exp/` | Bearer | Query: `months=6` | `200` `{ labels: string[], revenue: number[], expenses: number[] }` | Aggregates monthly revenue & costs from BusinessData and confirmed bills | `business_data`, `bills` | `DashboardPage.jsx` | `labels`, `revenue`, `expenses` |
| **GET** | `/api/v1/dashboard/profit-trends/` | Bearer | Query: `months=6`, `interval=monthly` | `200` `{ labels: string[], profit: number[], interval: string }` | Aggregates profit trends by monthly, weekly, or daily buckets | `business_data`, `bills` | `DashboardPage.jsx` | `labels`, `profit` |
| **GET** | `/api/v1/dashboard/workers/` | Bearer | Query: None | `200` `{"workers": [{"id", "name", "amount"}, ...]}` | Aggregates PayRecords grouped by worker | `pay_records`, `workers` | `DashboardPage.jsx` | `workers` (`name`, `amount`) |
| **GET** | `/api/v1/dashboard/top-workers/` | Bearer | Query: None | `200` `{"workers": [{"id", "name", "amount"}, ...]}` | Top 5 workers by total payment volume | `pay_records`, `workers` | `DashboardPage.jsx` | `workers` (`name`, `amount`) |
| **GET** | `/api/v1/bills/` | Bearer | Query: `type=kacha\|pakka` | `200` `Bill[]` | Lists company bills, sorted by `-created_at` | `bills` | `DashboardPage.jsx`, `BillManager.jsx`, `OrderDetailPage.jsx` | `id`, `invoice_number`, `bill_type`, `buyer`, `products`, `subtotal`, `gst_percentage`, `gst_amount`, `discount`, `grand_total`, `payments`, `amount_received`, `balance_due`, `payment_status`, `over_received`, `profit_confirmed`, `profit_confirmed_amount`, `order_status`, `created_at` |
| **POST** | `/api/v1/bills/` | Bearer | `{ bill_type: "kacha"\|"pakka", products, buyer, discount, gst_percentage }` | `201` `Bill` | Validates stock, decrements stock for linked inventory items, generates `INV-YYYY-NNNNN`, creates bill | `bills`, `inventory_items` | *Alternative creation endpoint* | *Full serialized Bill object* |
| **POST** | `/api/v1/bills/kacha/` | Bearer | `{ products: [{name, quantity, rate, unit, inventory_item_id}], buyer: {...}, discount }` | `201` `Bill` | Sets `gst_percentage=0`, decrements stock for linked items, generates invoice number | `bills`, `inventory_items` | `BillBuilder.jsx` | Full serialized `Bill` |
| **POST** | `/api/v1/bills/pakka/` | Bearer | `{ products: [...], buyer: {...}, discount, gst_percentage }` | `201` `Bill` | Validates GST fields, decrements stock, calculates GST amount and grand total, generates invoice number | `bills`, `inventory_items` | `BillBuilder.jsx` | Full serialized `Bill` |
| **GET** | `/api/v1/bills/<id>/` | Bearer | None | `200` `Bill` <br> `400` Invalid ID <br> `404` Not Found | Fetches single bill scoped to company | `bills` | `OrderDetailPage.jsx` | All serialized fields: `id`, `buyer`, `products`, `invoice_number`, `order_status`, `grand_total`, `amount_received`, `balance_due`, `payment_status`, `worker_assignment_ids`, `worker_cost_total`, `transportation_costs`, `transportation_cost_total`, `misc_costs`, `misc_cost_total`, `ready_to_deliver`, `ready_to_deliver_quantity`, `shipment_confirmed`, `shipment_confirmed_at`, `created_at` |
| **PUT** | `/api/v1/bills/<id>/` | Bearer | `{ products, buyer, discount, gst_number, gst_percentage }` | `200` `Bill` <br> `400` Validation error | Forbids changing bill_type; enforces pakka GST preservation; adjusts stock deltas (restores old, validates & decrements net new) | `bills`, `inventory_items` | `BillManager.jsx` | Full serialized `Bill` |
| **DELETE** | `/api/v1/bills/<id>/` | Bearer | None | `204` No Content | Restores stock for all linked inventory products; deletes bill | `bills`, `inventory_items` | `BillManager.jsx` | Status 204 |
| **POST** | `/api/v1/bills/<id>/convert/` | Bearer | `{ gst_number, gst_percentage, products?: [...] }` | `200` `Bill` <br> `400` Validation error | Verifies kacha status; validates GST details; reallocates stock if products changed; sets `bill_type="pakka"`; regenerates fresh invoice number | `bills`, `inventory_items` | `BillManager.jsx` | Full serialized `Bill` |
| **GET** | `/api/v1/bills/<id>/pdf/` | Bearer | None | `200` `application/pdf` (binary stream) | Renders `invoice.html` via WeasyPrint with company logo/stamp/details; streams PDF attachment | `bills`, `company` | `BillManager.jsx`, `OrderDetailPage.jsx` | Blob response -> triggers browser download as `${bill.invoice_number}.pdf` |
| **POST** | `/api/v1/bills/<id>/share-whatsapp/` | Bearer | Body: None (uses `bill.buyer.phone`) | `200` `{"detail": "Bill sent via WhatsApp.", "whatsapp_response": {...}}` | Renders PDF in memory; dispatches to Meta Cloud API or OpenWA bridge depending on `WHATSAPP_PROVIDER` | `bills`, `company` | `BillManager.jsx`, `OrderDetailPage.jsx` | Displays toast on success |
| **POST** | `/api/v1/bills/<id>/record-payment/` | Bearer | `{ amount: number, date?: string, notes?: string }` | `201` `Bill` | Appends payment record to `bill.payments`; updates derived `amount_received`, `balance_due`, `payment_status` | `bills` | `BillManager.jsx` | Full serialized `Bill` |
| **GET** | `/api/v1/bills/<id>/profit-preview/` | Bearer | None | `200` `{ revenue_collected, cost_breakdown, cost_basis_full, payment_fraction, cost_basis_scaled, suggested_profit, lines }` | Computes live suggested profit scaled by payment_fraction | `bills`, `inventory_items`, `material_assignments` | `BillManager.jsx` | `revenue_collected`, `cost_breakdown` (`material_cost`, `worker_cost`, `transportation_cost`, `misc_cost`), `cost_basis_full`, `payment_fraction`, `cost_basis_scaled`, `suggested_profit`, `lines` |
| **POST** | `/api/v1/bills/<id>/confirm-profit/` | Bearer | `{ confirmed_amount?: number }` | `200` `Bill` | Persists `profit_suggested_amount`, `profit_confirmed_amount`, sets `profit_confirmed=True`, `profit_confirmed_at=now()` | `bills` | `BillManager.jsx` | Full serialized `Bill` |
| **POST** | `/api/v1/bills/<id>/reopen-profit/` | Bearer | None | `200` `Bill` | Reverts `profit_confirmed=False`, clears confirmed amount and timestamp | `bills` | *Reopen action* | Full serialized `Bill` |
| **GET** | `/api/v1/bills/<id>/assignments/` | Bearer | None | `200` `MaterialAssignment[]` | Lists worker assignments linked to this bill (`bill_id=id`) | `material_assignments` | `OrderDetailPage.jsx` | Array of assignments (`id`, `worker_id`, `material_name`, `quantity`, `price_per_unit`, `assignment_date`, `notes`, `batches`, `delivered_quantity`, `balance_quantity`, `total_value`, `status`, `completed_at`, `wastage_quantity`, `wage_amount`) |
| **POST** | `/api/v1/bills/<id>/transportation-cost/` | Bearer | `{ amount: number, date?: string, notes?: string }` | `201` `Bill` | Appends `{ amount, date, notes }` to `bill.transportation_costs` | `bills` | `OrderDetailPage.jsx` | Full serialized `Bill` |
| **POST** | `/api/v1/bills/<id>/misc-cost/` | Bearer | `{ amount: number, date?: string, notes?: string }` | `201` `Bill` | Appends `{ amount, date, notes }` to `bill.misc_costs` | `bills` | `OrderDetailPage.jsx` | Full serialized `Bill` |
| **POST** | `/api/v1/bills/<id>/ready-to-deliver/` | Bearer | `{ inventory_item_id: string, quantity: number, date?: string, notes?: string }` | `201` `Bill` | Checks available inventory (accounting for other unshipped earmarks); appends batch entry to `bill.ready_to_deliver` (does NOT deduct inventory yet) | `bills`, `inventory_items` | `OrderDetailPage.jsx` | Full serialized `Bill` |
| **POST** | `/api/v1/bills/<id>/confirm-shipment/` | Bearer | None | `200` `Bill` | Deducts quantities in `ready_to_deliver` from `InventoryItem.quantity`; sets `shipment_confirmed=True`, `shipment_confirmed_at=now()` | `bills`, `inventory_items` | `OrderDetailPage.jsx` | Full serialized `Bill` |
| **GET** | `/api/v1/inventory/finished/` | Bearer | None | `200` `InventoryItem[]` | Lists finished items (`type="finished"`), ordered by `-updated_at` | `inventory_items` | `BillBuilder.jsx`, `OrderDetailPage.jsx`, `InventoryItemsPage.jsx` | `id`, `name`, `unit`, `type`, `selling_price`, `cost_price`, `quantity`, `reorder_level`, `warehouse_id`, `warehouse_name`, `warehouse` (`id`, `name`, `location`), `image_url`, `sku`, `status`, `created_at`, `updated_at` |
| **POST** | `/api/v1/inventory/finished/` | Bearer | `{ name, unit, selling_price, cost_price, quantity, reorder_level, warehouse_id, image_url }` | `201` `InventoryItem` | Generates `SKU-00001` sequence; creates finished item | `inventory_items` | `InventoryItemsPage.jsx`, `BillBuilder.jsx` | Full serialized `InventoryItem` |
| **PUT** | `/api/v1/inventory/finished/<id>/` | Bearer | `{ name, unit, selling_price, cost_price, quantity, reorder_level, warehouse_id, image_url }` | `200` `InventoryItem` | Updates item attributes | `inventory_items` | `InventoryItemsPage.jsx` | Full serialized `InventoryItem` |
| **DELETE** | `/api/v1/inventory/finished/<id>/` | Bearer | None | `204` No Content | Deletes inventory item | `inventory_items` | `InventoryItemsPage.jsx` | Status 204 |
| **GET** | `/api/v1/inventory/semi-finished/` | Bearer | None | `200` `InventoryItem[]` | Lists semi-finished items (`type="semi_finished"`) | `inventory_items` | `BillBuilder.jsx`, `OrderDetailPage.jsx`, `InventoryItemsPage.jsx` | Same as finished |
| **POST** | `/api/v1/inventory/semi-finished/` | Bearer | Item fields | `201` `InventoryItem` | Creates semi-finished item with SKU | `inventory_items` | `InventoryItemsPage.jsx`, `BillBuilder.jsx` | Full serialized `InventoryItem` |
| **PUT** | `/api/v1/inventory/semi-finished/<id>/` | Bearer | Item fields | `200` `InventoryItem` | Updates semi-finished item | `inventory_items` | `InventoryItemsPage.jsx` | Full serialized `InventoryItem` |
| **DELETE** | `/api/v1/inventory/semi-finished/<id>/` | Bearer | None | `204` No Content | Deletes semi-finished item | `inventory_items` | `InventoryItemsPage.jsx` | Status 204 |
| **GET** | `/api/v1/inventory/semi-finished/live/` | Bearer | None | `200` `{ manual_items: [...], in_production: [...] }` | Hybrid WIP: manual semi-finished items PLUS active open worker assignments with derived order status | `inventory_items`, `material_assignments`, `bills`, `workers` | `SemiFinishedInventoryPage.jsx` | `manual_items` (array of items), `in_production` (`id`, `source`, `assignment_id`, `name`, `unit`, `type`, `assigned_quantity`, `delivered_quantity`, `balance_quantity`, `quantity`, `location_label`, `worker_id`, `worker_name`, `order` (`bill_id`, `invoice_number`, `order_status`, `buyer_name`), `assignment_date`) |
| **GET** | `/api/v1/inventory/raw/` | Bearer | None | `200` `InventoryItem[]` | Lists raw material items (`type="raw"`) | `inventory_items` | `BillBuilder.jsx`, `InventoryItemsPage.jsx` | Same as finished |
| **POST** | `/api/v1/inventory/raw/` | Bearer | Item fields | `201` `InventoryItem` | Creates raw material item with SKU | `inventory_items` | `InventoryItemsPage.jsx`, `BillBuilder.jsx` | Full serialized `InventoryItem` |
| **PUT** | `/api/v1/inventory/raw/<id>/` | Bearer | Item fields | `200` `InventoryItem` | Updates raw material item | `inventory_items` | `InventoryItemsPage.jsx` | Full serialized `InventoryItem` |
| **DELETE** | `/api/v1/inventory/raw/<id>/` | Bearer | None | `204` No Content | Deletes raw material item | `inventory_items` | `InventoryItemsPage.jsx` | Status 204 |
| **GET** | `/api/v1/inventory/warehouses/` | Bearer | None | `200` `Warehouse[]` | Lists warehouses ordered by name | `warehouses` | `WarehousesPage.jsx`, `InventoryItemsPage.jsx` | `id`, `name`, `location`, `created_at` |
| **POST** | `/api/v1/inventory/warehouses/` | Bearer | `{ name: string, location?: string }` | `201` `Warehouse` | Creates warehouse | `warehouses` | `WarehousesPage.jsx` | Full serialized `Warehouse` |
| **PUT** | `/api/v1/inventory/warehouses/<id>/` | Bearer | `{ name: string, location?: string }` | `200` `Warehouse` | Updates warehouse details | `warehouses` | `WarehousesPage.jsx` | Full serialized `Warehouse` |
| **DELETE** | `/api/v1/inventory/warehouses/<id>/` | Bearer | None | `204` No Content | Unsets `warehouse_id` on all linked items in that warehouse; deletes warehouse | `warehouses`, `inventory_items` | `WarehousesPage.jsx` | Status 204 |
| **GET** | `/api/v1/inventory/meta/warehouse-summary/` | Bearer | None | `200` `WarehouseSummary[]` | Aggregates item counts, total quantity, and stock value grouped by warehouse and by type (raw/finished/semi_finished) | `warehouses`, `inventory_items` | `WarehousesPage.jsx` | `warehouse` (`id`, `name`, `location`), `items_count`, `total_quantity`, `stock_value`, `by_type` (`raw`, `finished`, `semi_finished`) |
| **GET** | `/api/v1/insights/` | Bearer | None | `200` `Insight[]` | Lists business insights sorted by `-created_at` | `insights` | `InsightsPage.jsx` | `id`, `title`, `description`, `labels`, `data_points`, `note`, `created_at` |
| **POST** | `/api/v1/insights/analyze/` | Bearer | None | `200` `{"count": int, "insights": [...]}` | Evaluates last 90 days of BusinessData; computes rolling moving averages & std-dev for spikes/drops; creates top product insights | `business_data`, `insights` | `InsightsPage.jsx` | Triggers reload |
| **DELETE** | `/api/v1/insights/<id>/` | Bearer | None | `204` No Content | Deletes insight | `insights` | `InsightsPage.jsx` | Status 204 |
| **GET** | `/api/v1/insights/<id>/export/` | Bearer | None | `200` `text/csv` (binary stream) | Generates CSV export with insight title, description, and period/value table | `insights` | `InsightsPage.jsx` | Blob response -> triggers download `${insight.title}.csv` |
| **GET** | `/api/v1/workers/` | Bearer | None | `200` `Worker[]` | Lists workers with computed summary stats: `material_assigned`, `material_delivered`, `pending_amount`, `open_assignments`, `wastage_rate` | `workers`, `material_assignments`, `pay_records` | `WorkersPage.jsx`, `OrderDetailPage.jsx` | `id`, `name`, `age`, `address`, `phone`, `image_url`, `joining_date`, `is_active`, `material_assigned`, `material_delivered`, `pending_amount`, `open_assignments`, `total_wasted`, `wastage_rate`, `created_at`, `updated_at` |
| **POST** | `/api/v1/workers/` | Bearer | `{ name, age, address, phone, image_url, joining_date }` | `201` `Worker` | Creates worker | `workers` | `WorkersPage.jsx` | Full serialized `Worker` |
| **GET** | `/api/v1/workers/<id>/` | Bearer | None | `200` `Worker` | Returns worker with calculated stats | `workers`, `material_assignments`, `pay_records` | *Worker detail views* | Full serialized `Worker` |
| **PUT** | `/api/v1/workers/<id>/` | Bearer | `{ name, age, address, phone, image_url, joining_date, is_active }` | `200` `Worker` | Updates worker fields | `workers` | `WorkersPage.jsx` | Full serialized `Worker` |
| **DELETE** | `/api/v1/workers/<id>/` | Bearer | None | `204` No Content | Cascades: deletes worker and all associated `material_assignments` and `pay_records` | `workers`, `material_assignments`, `pay_records` | `WorkersPage.jsx` | Status 204 |
| **GET** | `/api/v1/workers/<id>/materials/` | Bearer | None | `200` `MaterialAssignment[]` | Lists assignments for worker sorted by `-assignment_date` | `material_assignments` | `WorkersPage.jsx` | Array of serialized assignments |
| **POST** | `/api/v1/workers/<id>/materials/` | Bearer | `{ material_name, quantity, price_per_unit, date, notes, batches, wage_amount, bill_id }` | `201` `MaterialAssignment` | Validates bill_id (if supplied); creates assignment in "open" status | `material_assignments`, `bills`, `workers` | `WorkersPage.jsx`, `OrderDetailPage.jsx` | Full serialized `MaterialAssignment` |
| **GET** | `/api/v1/workers/<id>/payments/` | Bearer | None | `200` `PayRecord[]` | Lists pay records for worker sorted by `-date` | `pay_records` | `WorkersPage.jsx` | Array of serialized pay records |
| **POST** | `/api/v1/workers/<id>/payments/` | Bearer | `{ product_name, units_produced, rate_per_unit, amount_paid, date }` | `201` `PayRecord` | Validates amount_paid <= total_owed; creates pay record; sets `paid=(amount_paid >= total_owed)` | `pay_records`, `workers` | `WorkersPage.jsx` | Full serialized `PayRecord` |
| **POST** | `/api/v1/workers/materials/<id>/batches/` | Bearer | `{ quantity: number, date?: string, notes?: string }` | `201` `MaterialAssignment` | Validates assignment is "open"; appends returned batch chunk to `batches` | `material_assignments` | `WorkersPage.jsx` | Full serialized `MaterialAssignment` |
| **PUT** | `/api/v1/workers/materials/<id>/complete/` | Bearer | None | `200` `MaterialAssignment` | Runs 3-step resumable completion: 1. Syncs delivered quantity to finished inventory (`synced_to_inventory=True`); 2. Auto-creates `PayRecord` for `wage_amount` (`pay_record_id=...`); 3. Sets `status="completed"`. Links to bill if `bill_id` set | `material_assignments`, `inventory_items`, `pay_records`, `bills` | `WorkersPage.jsx` | Full serialized `MaterialAssignment` |
| **PUT** | `/api/v1/workers/payments/<id>/mark-paid/` | Bearer | None | `200` `PayRecord` | Sets `amount_paid = units_produced * rate_per_unit`, `paid=True` | `pay_records` | `WorkersPage.jsx` | Full serialized `PayRecord` |
| **POST** | `/api/v1/workers/payments/<id>/record-payment/` | Bearer | `{ amount: number }` | `201` `PayRecord` | Increments `amount_paid`; flips `paid=True` if total reached | `pay_records` | `WorkersPage.jsx` | Full serialized `PayRecord` |
| **POST** | `/api/v1/upload/csv/` | Bearer | Multipart: `file` or `csv_file` | `200` `{"created": int, "warnings": [...]}` <br> `400` Validation error | Parses UTF-8/BOM CSV; requires 7 columns; creates `BusinessData` rows; triggers `generate_financial_summaries(company_id)` | `business_data`, `financial_summaries` | `UploadPage.jsx` | `data.created`, `data.warnings` (`row`, `detail`) |
| **POST** | `/api/v1/upload/manual/` | Bearer | `{ date, product, category, quantity, production_cost, selling_price, region, customer_type }` | `201` `BusinessData` | Saves single `BusinessData` row; triggers `generate_financial_summaries` | `business_data`, `financial_summaries` | `UploadPage.jsx` | Displays success toast |
| **GET** | `/api/v1/profile/` | Bearer | None | `200` `{ user: {...}, company: {...} }` | Fetches combined profile | `user`, `company` | `ProfilePage.jsx` | `user` (`name`, `email`, `phone`, `location`, `username`, `profile_pic`), `company` (`company_id`, `name`, `address`, `email`, `phone`, `gst_number`, `logo_url`, `stamp_url`, `signature_url`, `bank_account_number`, `ifsc_code`, `bank_name`, `branch_name`) |
| **PUT** | `/api/v1/profile/` | Bearer | Multipart / Form: user fields, company fields, files `logo`, `stamp`, `signature` | `200` `{ user: {...}, company: {...} }` | Updates User & Company fields; saves logo/stamp/signature to file storage | `user`, `company` | `ProfilePage.jsx` | Full serialized profile |
| **GET** | `/api/v1/profile/settings/` | Bearer | None | `200` `{ workspace_settings: {...}, notifications: {...} }` | Fetches workspace toggles and user notification settings | `user`, `company` | `SettingsPage.jsx` | `workspace_settings` (`realtime_dashboard_refresh`, `jwt_session_authentication`, `ai_assistant_enabled`, `inventory_workspace_mode`), `notifications` (`comments`, `weekly_summary`, `updates`) |
| **PUT** | `/api/v1/profile/settings/` | Bearer | `{ realtime_dashboard_refresh, jwt_session_authentication, ai_assistant_enabled, inventory_workspace_mode, comments, weekly_summary, updates }` | `200` `{ workspace_settings: {...}, notifications: {...} }` | Merges workspace settings into Company; merges notification settings into User | `company`, `user` | `SettingsPage.jsx` | Full serialized settings |
| **GET** | `/api/v1/ai/config/` | Bearer | None | `200` `{ websocket_path: "/ws/ai-assistant/", starter_prompts: string[] }` | Returns AI socket path and prompts | None | *Headless / alternative caller* | `websocket_path`, `starter_prompts` |
| **POST** | `/api/v1/ai/command/` | Bearer | `{ command: string, assistant?: string }` | `200` `AICommandResponse` | HTTP execution of `process_ai_command` | `business_data`, `workers`, `material_assignments`, `pay_records`, `financial_summaries`, `insights` | *Headless / alternative caller* | `assistant`, `timestamp`, `action`, `url`, `file_url`, `content`, `message` |

---

## 3. External Integrations & Side Effects

### 3.1 Redis Usage
- **In Django**: Configured in `insightloop/insightloop/settings.py` via `REDIS_URL`. If set, used as the Channel Layer backend (`channels_redis.core.RedisChannelLayer`). If unset or invalid, falls back to in-memory channels with a warning.
- **Beyond Channels**: A `redis_client` variable is initialized in `insightloop/insightloop/settings.py` if `REDIS_URL` is set, but **is never called or referenced anywhere else in the backend codebase**. There are no Redis caches, lock managers, or celery queues.
- **Target Node Stack**: Express API uses `ws` with `ioredis` for multi-instance WebSocket pub/sub fan-out when `REDIS_URL` is present, with an in-memory EventEmitter fallback when absent.

### 3.2 SMTP / Email Integration
- **Configured In**: `insightloop/insightloop/settings.py` (`EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`, `ADMIN_EMAIL`).
- **Call Sites**: Exactly one active endpoint: `POST /contact` in `landing/views.py`. When a contact message is received, it saves `ContactMessage` to MongoDB and sends an `EmailMessage` to `ADMIN_EMAIL`.
- **Side Effect Handling**: The email dispatch is wrapped in a `try...except` block; failure to send does not prevent the `ContactMessage` from persisting or return a 500 error.

### 3.3 Google OAuth / Tokeninfo
- **Endpoint**: `POST /api/v1/auth/google/` (`landing/api_views.py:GoogleLoginApiView`).
- **External Call**: Performs an HTTP GET request to `https://oauth2.googleapis.com/tokeninfo?id_token=<id_token>` with a strict 10s timeout.
- **Verification Rules**:
  - Checks HTTP 200 response (non-200 returns 401).
  - Network/connection failure returns HTTP 502 (`{"detail": "Could not verify Google credential."}`).
  - Validates `payload.get("aud") == settings.GOOGLE_OAUTH2_CLIENT_ID` (mismatch returns 401).
  - Validates `payload.get("email_verified") in ("true", True)` (mismatch returns 401).
  - Validates presence of email (missing returns 400).
- **Auto-Provisioning**: If email is unrecognised, atomically auto-creates a new `Company(name=f"{name}'s Company")` and `User(email=email, company=company, username=...)` with a cryptographically random unusable password.

### 3.4 WhatsApp Messaging (Dual Provider)
- **Controlled By**: `WHATSAPP_PROVIDER` env var (`meta` vs `openwa`).
- **Provider 1: Meta Cloud API (`bills/whatsapp.py`)**:
  - Guards: If `not settings.WHATSAPP_ENABLED`, immediately raises `WhatsAppNotConfigured` without making external calls.
  - Flow:
    1. Uploads PDF bytes to `https://graph.facebook.com/v19.0/{phone_number_id}/media` (`type="application/pdf"`).
    2. Sends approved template message (`WHATSAPP_BILL_TEMPLATE_NAME`, default `bill_share`) with document header to customer's normalized Indian phone number (`91<digits>`).
  - Timeout: 10 seconds per request.
- **Provider 2: OpenWA Server Bridge (`bills/whatsapp_openwa.py`)**:
  - Guards: If `not settings.OPENWA_API_KEY`, raises `OpenWANotConfigured`.
  - Flow:
    1. Fetches active sessions from `{base_url}/api/sessions` with `x-api-key`.
    2. Encodes PDF bytes to raw base64.
    3. Posts to `{base_url}/api/sessions/{session_id}/messages/send-document` with `chatId: "<digits>@c.us"`.
- **Target Node Stack**: Keep identical provider interface and fallback errors.

### 3.5 Cron & Background Management Tasks
- **Scheduled Workers**: No Celery, RQ, or system crons are configured in `render.yaml` or code. The production deployment runs a single web process (`daphne`).
- **Management Commands**:
  - `python manage.py process_uploaded_data <company_id>`: Aggregates `BusinessData` into `FinancialSummary` monthly buckets. (Also invoked inline by `CsvUploadApiView` and `ManualUploadApiView`).
  - `python manage.py backfill_inventory_from_production [--company-id <id>] [--dry-run]`: One-time backfill that reads completed `MaterialAssignment` records without `synced_to_inventory` and increments `InventoryItem.quantity`.
- **Target Node Stack**: Port both commands as typed CLI scripts in `apps/api/src/scripts/` with `--dry-run` default and production safeguards.

### 3.6 File Storage Audit: Physical Locations & Ephemeral Disk Risks
Uploaded and generated files are handled as follows:

| File Type | Model Field / Path | Physical Storage Location | Ephemeral Disk Risk | Mitigation / Target Stack Action |
| :--- | :--- | :--- | :--- | :--- |
| **User Profile Picture** | `User.profile_pic` | MongoDB **GridFS** (bucket collection: `profile_pics.files` / `chunks`) | **NO** (safely persisted in MongoDB) | GridFS stream read/write endpoints ported to Node. |
| **Company Logo** | `Company.logo_url` | `default_storage.save(profile/<company_id>/logo_...)` | **CRITICAL RISK** if S3 unset: saved to `MEDIA_ROOT` on local Render filesystem, wiped on restart/deploy! | If `USE_S3_STORAGE=True`, stored in S3. If False, files are lost on container restart. Node must support S3 / local abstraction. |
| **Company Stamp** | `Company.stamp_url` | `default_storage.save(profile/<company_id>/stamp_...)` | **CRITICAL RISK** (same as Logo) | Same as Logo. |
| **Company Signature** | `Company.signature_url` | `default_storage.save(profile/<company_id>/signature_...)` | **CRITICAL RISK** (same as Logo) | Same as Logo. |
| **Worker Photo** | `Worker.image_url` | Legacy view sets `/media/workers/<name>`, API expects a URL string | **CRITICAL RISK** if local file used | Same as Logo. |
| **CSV Upload Data** | N/A (ingest only) | Read from memory stream (`TextIOWrapper`) | **NO** (parsed into `BusinessData` docs, file not kept on disk) | Preserved: parse in-flight stream via `csv-parse`. |
| **Generated Bill PDF** | N/A (generated on fly) | Generated in-memory via WeasyPrint into `io.BytesIO()`; streamed as HTTP response | **NO** (not written to disk) | Preserved: render on fly via Puppeteer/Playwright and stream buffer. |
| **AI Export CSV Files** | N/A (generated on fly) | `default_storage.save(exports/<company_id>/...)` | **CRITICAL RISK** (written to `MEDIA_ROOT` via `default_storage`) | In Node, stream directly as download response or store in S3 if asynchronous. |
