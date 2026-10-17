# Business Logic & Mathematical Specification Inventory

This document details the core business logic, financial formulas, rounding rules, idempotency invariants, and edge-case behaviors across InsightLoop.

---

## 1. Floating-Point & Rounding Conventions

### 1.1 Python `round()` vs JavaScript `Math.round()`
- **Python Behavior**: Python 3's built-in `round(x, n)` implements **banker's rounding (round half to even)** on binary floating-point numbers:
  - `round(2.5) == 2`, `round(3.5) == 4`
  - Exact binary float ties: `round(0.125, 2) == 0.12`, `round(0.375, 2) == 0.38`.
- **Standard JavaScript Behavior**: `Math.round()` rounds half towards positive infinity (`round(-2.5) == -2`, `round(2.5) == 3`). `Number.toFixed()` uses string formatting with browser-dependent IEEE-754 quirks.
- **Migration Requirement**: We must implement an exact `roundPy(val: number, ndigits: number = 2): number` utility in `packages/shared` and fuzz-test it against 100,000+ golden vectors generated from Python 3.11/3.13.

---

## 2. Billing & Invoicing Engine (`bills/`)

### 2.1 Bill Payload Construction & Normalization (`_normalize_products`, `_build_bill_payload`)
- **Inputs**: Incoming line items `products: [{ name, quantity, rate|price|unit_price, unit, inventory_item_id }]`.
- **Calculations**:
  - `quantity = float(product.quantity or 0)`
  - `rate = float(product.rate or product.price or product.unit_price or 0)`
  - `line_total = round(quantity * rate, 2)`
  - `subtotal = round(sum(line_total), 2)`
  - `taxable_amount = max(subtotal - discount, 0)`
  - For **pakka** bills: `gst_amount = round(taxable_amount * gst_percentage / 100, 2)`
  - For **kacha** bills: `gst_percentage = 0`, `gst_amount = 0` (forced regardless of user input).
  - `grand_total = round(taxable_amount + gst_amount, 2)`
- **Edge Cases**:
  - `discount > subtotal`: Clamped to 0 taxable amount (`max(subtotal - discount, 0)`). `grand_total` becomes 0.
  - Zero, negative, or string rates: Coerced to float; negative rates must be rejected by validation schema.
  - Freeform products: `inventory_item_id` can be null/undefined. Only lines with valid `inventory_item_id` affect inventory stock.

### 2.2 Invoice Number Generation & Formatting
- **Format**: `INV-<YYYY>-<5-digit-sequence>` (e.g. `INV-2026-00001`).
- **Scope**: Scoped per `company_id` and year.
- **Sequence Logic**:
  - Queries `Bill.objects(company_id=company_id, invoice_number__startswith=f"INV-{year}-").order_by("-invoice_number").first()`.
  - Splits candidate by `-` and increments sequence by 1.
  - Checks if candidate exists in DB; while exists, increments sequence.
  - Collision Retry: In `_save_with_retry`, up to 5 attempts catch `NotUniqueError`, clear candidate, and re-generate.
- **Conversion to Pakka**: When converting a kacha bill to pakka (`POST /bills/<id>/convert/`), `bill.invoice_number` is set to null, generating a brand-new number in the pakka series.

### 2.3 Stock Reconciliation & Inventory Linking
- **Creation (`_reconcile_stock_on_create`)**:
  1. Computes total delta per `inventory_item_id` across lines (`_stock_deltas`).
  2. Validates availability: `if item.quantity < requested_qty`, raises `ValidationError({"detail": "Insufficient stock: ..."})`.
  3. Applies stock reduction: `InventoryItem.update(dec__quantity=delta)`.
  4. *Quirk/Edge Case*: If an item is deleted between draft and save, `_apply_stock_change` silently skips it without blocking billing.
- **Update (`_reconcile_stock_on_update`)**:
  1. Computes old deltas and new deltas.
  2. Net delta: `net = new_qty - old_qty`.
  3. Validates available stock for positive net deltas.
  4. Applies net change (`dec__quantity=net`).
- **Deletion (`_restore_stock_on_delete`)**:
  - Restores stock: `InventoryItem.update(dec__quantity=-qty)` (effectively increments).
- **Ready-to-Deliver Earmarking vs Shipment Confirmation**:
  - `add_ready_to_deliver`: Validates `item.quantity - already_earmarked >= quantity`. Does **NOT** deduct stock immediately.
  - `confirm_shipment`: Deducts `quantity` in `ready_to_deliver` batches from `InventoryItem.quantity`. Sets `shipment_confirmed=True`.

### 2.4 Payment Collection & Derived Properties
- **Properties (computed on the fly, never stored)**:
  - `amount_received = round(sum(p.amount for p in payments), 2)`
  - `balance_due = round(max(grand_total - amount_received, 0), 2)`
  - `over_received = (amount_received > grand_total)`
  - `payment_status`:
    - `"paid"` if `grand_total <= 0` or `amount_received >= grand_total`
    - `"unpaid"` if `amount_received <= 0`
    - `"partial"` otherwise.
  - `payment_fraction = min(amount_received / grand_total, 1.0)` (0.0 if `grand_total <= 0`).
- **Order Lifecycle Status (`order_status`)**:
  1. If `profit_confirmed and payment_status == "paid"` -> `"closed"`
  2. If `shipment_confirmed` -> `"shipped"`
  3. If `bill_type == "kacha"` -> `"draft"`
  4. If no linked `MaterialAssignment`s -> `"confirmed"`
  5. If all linked `MaterialAssignment`s have `status == "completed"` -> `"ready_to_ship"`
  6. Otherwise -> `"in_production"`

### 2.5 Suggested & Confirmed Profit Engine (`bills/profit.py`)
- **Cost of Goods Components**:
  - `material_cost`: Sum of `(item.cost_price * qty)` for all lines linked to inventory.
  - `worker_cost`: Sum of `wage_amount` for all completed `MaterialAssignment`s linked to this bill (`bill_id`).
  - `transportation_cost`: Sum of `amount` in `bill.transportation_costs`.
  - `misc_cost`: Sum of `amount` in `bill.misc_costs`.
  - `full_cost_of_goods = round(material_cost + worker_cost + transportation_cost + misc_cost, 2)`.
- **Scaling Formula**:
  - `fraction = bill.payment_fraction`
  - `scaled_cost = round(full_cost_of_goods * fraction, 2)`
  - `suggested_profit = round(bill.amount_received - scaled_cost, 2)`
- **Profit Confirmation Gate**:
  - A bill contributes **0** to company revenue and profit until `profit_confirmed=True`.
  - The user may confirm the suggested amount or provide an explicit `confirmed_amount` override.

---

## 3. Worker Operations & Resumable Idempotency (`worker/`)

### 3.1 Idempotent `MaterialAssignment.complete()` State Machine
In `worker/models.py`, `complete()` coordinates changes across three documents without MongoDB multi-document transactions. It is designed to be **safely resumable**:

```
[Start complete()]
       │
       ▼
1. Compute wastage_quantity = max(quantity - delivered_quantity, 0)
       │
       ▼
2. Check synced_to_inventory:
   - If False and delivered_quantity > 0:
       Find-or-create Finished Goods item (case-insensitive name match)
       Increment stock by delivered_quantity
       Set synced_to_inventory = True
       SAVE ASSIGNMENT IMMEDIATELY (Checkpoint 1)
       │
       ▼
3. Check pay_record_id:
   - If not set and wage_amount > 0 and worker present:
       Create PayRecord(amount_paid=0, paid=False, bill_id=bill_id)
       Save PayRecord
       Set pay_record_id = str(new_pay_record.id)
       SAVE ASSIGNMENT IMMEDIATELY (Checkpoint 2)
       │
       ▼
4. Final State Lock:
   Set status = "completed", completed_at = now()
   SAVE ASSIGNMENT (Final Checkpoint)
```
- **Crash Recovery Guarantees**:
  - If process terminates after Step 2, `synced_to_inventory` is already `True`. Re-invoking `complete()` skips inventory sync, preventing duplicate stock.
  - If process terminates after Step 3, `pay_record_id` is already saved. Re-invoking `complete()` skips PayRecord creation, preventing duplicate payment liabilities.

### 3.2 Worker Aggregations & Metrics (`_serialize_worker`)
- `material_assigned = sum(assignment.quantity)`
- `material_delivered = sum(assignment.delivered_quantity)`
- `total_wasted = sum(assignment.wastage_quantity for assignment in completed_assignments)`
- `wastage_rate = round((total_wasted / total_assigned_completed) * 100, 1)` if `total_assigned_completed > 0` else `0.0`
- `pending_amount`: Sum over unpaid PayRecords: `(units_produced * rate_per_unit) - amount_paid`.

---

## 4. Inventory SKU Generation (`inventory/`)

- **Format**: `SKU-<5-digit-sequence>` (e.g. `SKU-00001`).
- **Generation Logic**:
  - Finds latest `InventoryItem` for company: `InventoryItem.objects(company_id=company_id).order_by("-created_at").first()`.
  - Extracts integer suffix; increments by 1.
  - Iterates while `InventoryItem.objects(company_id=company_id, sku=candidate).count() > 0`.
- **Approved Fix #1**: In Node, replace this sequential scan with an atomic `$inc` on an additive `counters` collection with a fallback for existing numbers.

---

## 5. Dashboard & Analytics Aggregations (`dashboard/`)

### 5.1 Real-Time Financial Aggregation (`get_live_financial_summary`)
- Combines three distinct data streams:
  1. **Confirmed Bills**: `Bill.objects(company_id=company_id, profit_confirmed=True)`.
     - `revenue = sum(bill.amount_received)`
     - `profit = sum(bill.profit_confirmed_amount)`
  2. **Uploaded Business Data**: `BusinessData.objects(company_id=company_id)`.
     - `revenue = sum(quantity * selling_price)`
     - `cost = sum(quantity * production_cost)`
     - `profit = revenue - cost`
  3. **Worker Payouts**: `PayRecord.objects(company_id=company_id)`.
     - `worker_payments = sum(amount_paid)` (Only actual cash paid out reduces profit).
- **Total Combined Metrics**:
  - `total_revenue = round(bill_revenue + uploaded_revenue, 2)`
  - `total_profit = round(bill_profit + uploaded_profit - worker_payments, 2)`

### 5.2 Month-Over-Month Change Formula
- `calc_change(old, new)`:
  - If `old == 0 and new == 0` -> `0.0`
  - If `old == 0` -> `100.0 if new > 0 else -100.0`
  - Otherwise: `float(round(((new - old) / abs(old)) * 100, 1))`
- **Timezone / Naive Datetime Rule**: Comparison boundaries use **naive `datetime.now()`** (Render container local time, which is UTC). Naive and aware datetimes must not be mixed.

---

## 6. Business Insights Analytics Engine (`insights/views.py:analyze_sales_data`)

- **Scope**: Last 90 days of `BusinessData` for the caller's company.
- **Spike / Drop Detection**:
  - Computes daily sales totals sorted chronologically.
  - For series length $\ge 5$:
    - Computes a 3-day backward moving average for each point: $MA_i = \frac{1}{|W|} \sum_{j \in W} \text{amount}_j$ where $W = [\max(0, i-2) \dots i]$.
    - Computes population standard deviation $\sigma = \text{std}(\text{amounts})$.
    - Sets threshold: $T = \max(0.5 \cdot \sigma, 5.0)$.
    - For each day $i \ge 2$:
      - $\Delta = \text{amount}_i - MA_i$.
      - If $|\Delta| > T$:
        - Type is `"spike"` if $\Delta > 0$ else `"drop"`.
        - Emits an Insight record with title, description, and window labels/data points.
- **Top Product Performance**:
  - Sums revenue grouped by `product`.
  - Takes top 5 products sorted descending by revenue.
  - Emits an Insight record for `"Top Performing Products"`.

---

## 7. AI Assistant Keyword Processor (`aiexport/ai_processor.py`)

The processor implements a deterministic keyword-matching decision tree. Group precedence is strict:

```
1. "export" in command:
   - "business" | "sales" | "revenue"    -> export_type: "business_trends"
   - "worker" | "labor" | "staff"        -> export_type: "worker_management"
   - "salary" | "payment" | "payroll"    -> export_type: "salary_payments"
   - "complete" | "all" | "full"         -> export_type: "complete_analytics"
   - none of above                      -> prompt clarification message

2. Navigation keywords (elif):
   - "dashboard" | "home" | "overview"   -> navigate("/dashboard")
   - "insight" | "analysis" | "findings" -> navigate("/insights")
   - "upload" | "import" | "data"        -> navigate("/upload")
   - "workers" | "staff"                 -> navigate("/workers")
   - "bills" | "invoice"                 -> navigate("/bills/pakka")
   - "inventory" | "stock"               -> navigate("/inventory/finished")

3. Data query keywords (elif "show" | "display" | "what is" | "how much"):
   - "revenue" | "income" | "sales"      -> display(revenue_trends)
   - "profit" | "earnings" | "margin"    -> display(profit_analysis)
   - "worker" | "staff" | "labor"        -> display(worker_performance)

4. Default fallback (else):
   - Helpful guided suggestion message.
```

*Precedence Collision Rule*: If a user enters "Export dashboard revenue", `"export"` is evaluated in step 1 and matched before step 2 ("dashboard"). Step 1 wins and exports `"business_trends"`. This exact evaluation order must be preserved.
