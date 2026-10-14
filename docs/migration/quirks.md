# Known Quirks & Edge Behaviors Catalog

In accordance with Section 7 (The Quirk Policy), all quirks and behavioral anomalies discovered in the Django implementation are documented here. The default policy is **`PRESERVE`** (port exact behavior first, proven by characterization tests). Only items approved by the user move to the Approved Fix List.

---

## 1. Cataloged Quirks

### QRK-01: Non-Atomic Sequential Invoice & SKU Generation
- **What It Does**: Queries the highest candidate sequence (`order_by("-invoice_number").first()`), parses the integer, increments it, checks if it exists in a `while` loop, and attempts to save. Under concurrent saves, two requests can calculate the same number; Django relies on a unique index violation catching the error and retrying up to 5 times.
- **Evidence**: `insightloop/bills/models.py:generate_invoice_number` and `insightloop/inventory/models.py:generate_sku`.
- **Risk If Changed**: If sequence formatting or numbering gaps change, existing invoice sequence is broken.
- **Recommendation**: **`PROPOSE-FIX`** (Approved Fix #1): Add an additive `counters` collection with atomic `findOneAndUpdate({$inc})`, while retaining a fallback that tolerates numbers generated concurrently by Django during canary.

### QRK-02: Silent Stock Change Skip for Deleted Items
- **What It Does**: When reconciling stock on bill creation, update, or deletion, if an `inventory_item_id` no longer exists in `InventoryItem` (or has an invalid ObjectId), `_apply_stock_change` silently catches the exception or null result and returns without error.
- **Evidence**: `insightloop/bills/views.py:138-147` (`_apply_stock_change`).
- **Risk If Changed**: Rejecting the bill update would prevent users from managing or deleting historical bills that reference an inventory item deleted in the past.
- **Recommendation**: **`PRESERVE`**. Retain the silent skip behavior.

### QRK-03: `confirm_profit` Allows Confirmation on Unpaid Bills
- **What It Does**: `confirm_profit` (`POST /api/v1/bills/<id>/confirm-profit/`) locks in a profit figure and sets `profit_confirmed=True` regardless of whether the bill's `payment_status` is `"paid"`, `"partial"`, or `"unpaid"`.
- **Evidence**: `insightloop/bills/views.py:441-468`.
- **Risk If Changed**: Blocking profit confirmation on unpaid bills could break user workflows where consignment profit is agreed upon in advance.
- **Recommendation**: **`PRESERVE`**. Keep exact behavior. Note that `order_status` will only transition to `"closed"` once both `profit_confirmed=True` AND `payment_status == "paid"`.

### QRK-04: AI Assistant Broadcasts Replies to Entire Company Group
- **What It Does**: When a user sends a command to the AI Assistant WebSocket (`ws/ai-assistant/`), the response is dispatched via `channel_layer.group_send(f"ai_assistant_{company_id}", ...)` to ALL users in that company who currently have the AI Assistant open.
- **Evidence**: `insightloop/aiexport/consumers.py:106-109`.
- **Risk If Changed**: Two users in the same company interacting with the AI assistant simultaneously see each other's responses.
- **Recommendation**: **`PROPOSE-FIX`** (Approved Fix #4): In Node, send the AI response directly to the requesting client connection, while preserving company-scoped DB access.

### QRK-05: AI Assistant Consumer Trusts Token `company_id` Claim
- **What It Does**: `AIAssistantConsumer` extracts `company_id` directly from the JWT payload (`payload.get("company_id")`). In contrast, `DashboardConsumer` looks up the live `User` in MongoDB by email and resolves `user.company.company_id`.
- **Evidence**: `insightloop/aiexport/consumers.py:27` vs `insightloop/dashboard/consumers.py:51`.
- **Risk If Changed**: A user whose company was modified or whose token was tampered with could join an unauthorized AI group.
- **Recommendation**: **`PROPOSE-FIX`** (Approved Fix #4): In Node, resolve `company_id` from the authenticated user record in both WebSocket gateways.

### QRK-06: File Upload Storage Defaults to Ephemeral Container Disk
- **What It Does**: `Company` logos, stamps, signatures, and exported CSVs use Django `default_storage.save()`. Because `django-storages` is not in `requirements.txt`, `USE_S3_STORAGE` is disabled and files are written to the local container disk (`BASE_DIR / "media"`), which is ephemeral on Render.
- **Evidence**: `insightloop/settings.py:448` and `requirements.txt`.
- **Risk If Changed**: Files saved locally are lost on restart.
- **Recommendation**: **`PROPOSE-FIX`**: In Node, support S3/Cloud Storage upload with fallback to MongoDB GridFS or local directory, preventing data loss on container cycling.

### QRK-07: CSV Upload Ingest Re-Generates All Historical Financial Summaries
- **What It Does**: Whenever a CSV is uploaded with `created > 0`, `generate_financial_summaries(company_id)` drops all existing `FinancialSummary` records for that company and recalculates them from `BusinessData`.
- **Evidence**: `insightloop/upload/api_views.py:53` and `dashboard/management/commands/process_uploaded_data.py:18`.
- **Risk If Changed**: Could affect performance on massive historical datasets; however, live dashboard summary (`get_live_financial_summary`) computes figures on the fly anyway.
- **Recommendation**: **`PRESERVE`**. Retain identical behavior in Node.

### QRK-08: Naive Datetime Boundaries in Date Math
- **What It Does**: Aggregation boundaries use naive `datetime.now()` rather than timezone-aware datetimes, because MongoEngine/pymongo stores dates as UTC and mixing aware datetimes triggers errors.
- **Evidence**: `insightloop/dashboard/data_service.py:194-199`.
- **Risk If Changed**: Mixing aware and naive datetimes produces silent query mismatches or driver exceptions.
- **Recommendation**: **`PRESERVE`**. Express/Mongoose will treat date boundaries consistently as UTC instants.
