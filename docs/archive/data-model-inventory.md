# Data Model & MongoDB Schema Inventory

This document details the database architecture of InsightLoop, introspecting both the MongoEngine ODM definitions and the live local MongoDB replica/instance (`mongodb://localhost:27017/InsightLoop`).

---

## 1. Live Collections Overview (Introspected from MongoDB)

| Collection Name | MongoEngine Model | Document Count | Storage Size (Bytes) | Total Index Size (Bytes) | Missing / Null `company_id` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `company` | `landing.mongo_models.Company` | 1 | 20,480 | 20,480 | N/A (Root tenant document) |
| `user` | `landing.mongo_models.User` | 1 | 20,480 | 40,960 | 0 (References `company._id`) |
| `inventory_items` | `inventory.models.InventoryItem` | 0 | 4,096 | 12,288 | 0 |
| `warehouses` | `inventory.models.Warehouse` | 0 | 0 (lazy) | 0 (lazy) | 0 |
| `bills` | `bills.models.Bill` | 0 | 4,096 | 20,480 | 0 |
| `workers` | `worker.models.Worker` | 0 | 4,096 | 12,288 | 0 |
| `material_assignments` | `worker.models.MaterialAssignment` | 0 | 0 (lazy) | 0 (lazy) | 0 |
| `pay_records` | `worker.models.PayRecord` | 0 | 4,096 | 20,480 | 0 |
| `business_data` | `upload.models.BusinessData` | 0 | 4,096 | 24,576 | 0 |
| `insights` | `insights.models.Insight` | 0 | 0 (lazy) | 0 (lazy) | 0 |
| `financial_summaries` | `dashboard.models.FinancialSummary` | 0 | 0 (lazy) | 0 (lazy) | 0 |
| `contact_message` | `landing.mongo_models.ContactMessage` | 0 | 0 (lazy) | 0 (lazy) | 0 (Global contact form) |

*Tenancy Risk Finding*: In the local data copy, **zero** business documents have missing or null `company_id`. Tenancy isolation across all business collections is clean.

---

## 2. Password Hash Prefix Distribution (`user` Collection)

> [!IMPORTANT]
> In accordance with safety rules, no user passwords, salts, hashes, or emails are exposed. The scan records only the algorithm prefix and iteration count.

| Algorithm & Iterations | Count | Status | Notes |
| :--- | :--- | :--- | :--- |
| `pbkdf2_sha256$600000` | 1 | Standard Django 4.2+ PBKDF2-SHA256 | Iterations: 600,000; Hash format: `pbkdf2_sha256$<iterations>$<salt>$<hash>` |
| *Other Algorithms* | 0 | None found | No legacy SHA1 or MD5 hashes detected |

**Compatibility Strategy**:
Node.js `verifyDjangoPbkdf2` helper will use `crypto.pbkdf2Sync(rawPassword, salt, iterations, 32, 'sha256').toString('base64')` and compare using `crypto.timingSafeEqual`. Passwords will **NOT** be upgraded/rehashed on login during migration to preserve zero-downtime rollback to Django (`REHASH_PASSWORDS_ON_LOGIN=false`).

---

## 3. GridFS Buckets

- **Target Bucket**: `profile_pics` (collections: `profile_pics.files`, `profile_pics.chunks`).
- **Referenced By**: `landing.mongo_models.User.profile_pic` (`FileField(collection_name='profile_pics')`).
- **Current Status**: 0 files stored locally (`profile_pic: null` on local user).
- **Node Integration**: Use Mongoose GridFSBucket (`new mongoose.mongo.GridFSBucket(db, { bucketName: 'profile_pics' })`) for byte-level read/write compatibility.

---

## 4. Collection-by-Collection Schema & Index Specifications

### 4.1 Collection: `company`
- **MongoEngine Class**: `landing.mongo_models.Company`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
- **Field Type Sampling & Definitions**:
  - `_id`: BSON `ObjectId` (primary key)
  - `company_id`: BSON `string` (UUID v4 string, e.g. `"313fd1a8-0d10-4a82-820a-4f741150959c"`) - **Primary tenant identifier for all other collections**
  - `name`: BSON `string` (max_length 100)
  - `business_type`: BSON `string` (default: `"Data & Insights Platform"`)
  - `email`: BSON `string` (optional)
  - `address`: BSON `string` (optional)
  - `phone`: BSON `string` (optional)
  - `gst_number`: BSON `string` (optional)
  - `logo_url`: BSON `string` (optional)
  - `stamp_url`: BSON `string` (optional)
  - `signature_url`: BSON `string` (optional)
  - `bank_account_number`: BSON `string` (optional)
  - `ifsc_code`: BSON `string` (optional)
  - `bank_name`: BSON `string` (optional)
  - `branch_name`: BSON `string` (optional)
  - `workspace_settings`: BSON `object` (keys: `realtime_dashboard_refresh`, `jwt_session_authentication`, `ai_assistant_enabled`, `inventory_workspace_mode`)
  - `created_at`: BSON `date` (naive UTC)
  - `updated_at`: BSON `date` (naive UTC)
- **Field Type Consistency**: No mixed types found.

### 4.2 Collection: `user`
- **MongoEngine Class**: `landing.mongo_models.User`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `email_1`: `{"email": 1}`, unique: true
- **Field Type Sampling & Definitions**:
  - `_id`: BSON `ObjectId`
  - `company`: BSON `ObjectId` (Foreign reference pointing to `company._id`)
  - `name`: BSON `string`
  - `email`: BSON `string` (unique, lowercase normalized)
  - `password`: BSON `string` (`pbkdf2_sha256$<iterations>$<salt>$<hash>`)
  - `phone`: BSON `string` (optional)
  - `location`: BSON `string` (optional)
  - `username`: BSON `string` (derived from email prefix)
  - `created_at`: BSON `date`
  - `last_login`: BSON `date`
  - `subscription`: BSON `string` (default: `"Pro Plan (₹499/mo)"`)
  - `notifications`: BSON `object` (`comments`, `weekly_summary`, `updates`)
  - `profile_pic`: BSON `ObjectId` or `null` (GridFS file ID in `profile_pics`)
- **Field Type Consistency**: Clean.

### 4.3 Collection: `bills`
- **MongoEngine Class**: `bills.models.Bill`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `company_id_1_bill_type_1`: `{"company_id": 1, "bill_type": 1}`
  - `company_id_1_invoice_number_1`: `{"company_id": 1, "invoice_number": 1}`, unique: true
  - `company_id_1_profit_confirmed_1`: `{"company_id": 1, "profit_confirmed": 1}`
  - `created_at_-1`: `{"created_at": -1}`
- **Field Types & Schema**:
  - `company_id`: BSON `string` (required)
  - `bill_type`: BSON `string` (`"kacha"` or `"pakka"`)
  - `buyer`: BSON `object` (`name`, `address`, `gst_number`, `phone`)
  - `products`: BSON `array` of `object` (`name`, `description`, `quantity`, `rate`, `unit`, `total`, `inventory_item_id`)
  - `subtotal`: BSON `double`
  - `gst_percentage`: BSON `double`
  - `gst_amount`: BSON `double`
  - `discount`: BSON `double`
  - `grand_total`: BSON `double`
  - `invoice_number`: BSON `string` (format: `INV-<YYYY>-<5-digits>`)
  - `payments`: BSON `array` of `object` (`amount`, `date`, `notes`)
  - `profit_confirmed`: BSON `bool` (default: false)
  - `profit_suggested_amount`: BSON `double` or `null`
  - `profit_confirmed_amount`: BSON `double` or `null`
  - `profit_confirmed_at`: BSON `date` or `null`
  - `worker_assignment_ids`: BSON `array` of `string`
  - `transportation_costs`: BSON `array` of `object` (`amount`, `date`, `notes`)
  - `misc_costs`: BSON `array` of `object` (`amount`, `date`, `notes`)
  - `ready_to_deliver`: BSON `array` of `object` (`inventory_item_id`, `item_name`, `quantity`, `date`, `notes`)
  - `shipment_confirmed`: BSON `bool` (default: false)
  - `shipment_confirmed_at`: BSON `date` or `null`
  - `created_at`: BSON `date`
  - `updated_at`: BSON `date`

### 4.4 Collection: `inventory_items`
- **MongoEngine Class**: `inventory.models.InventoryItem`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `company_id_1_type_1`: `{"company_id": 1, "type": 1}`
  - `company_id_1_sku_1`: `{"company_id": 1, "sku": 1}`, unique: true
- **Field Types & Schema**:
  - `company_id`: BSON `string`
  - `name`: BSON `string`
  - `unit`: BSON `string` (default: `"pcs"`)
  - `type`: BSON `string` (`"finished"`, `"semi_finished"`, `"raw"`)
  - `selling_price`: BSON `double`
  - `cost_price`: BSON `double`
  - `quantity`: BSON `double`
  - `reorder_level`: BSON `double`
  - `warehouse_id`: BSON `string` or `null`
  - `image_url`: BSON `string` or `null`
  - `sku`: BSON `string` (format: `SKU-<5-digits>`)
  - `created_at`: BSON `date`
  - `updated_at`: BSON `date`

### 4.5 Collection: `warehouses`
- **MongoEngine Class**: `inventory.models.Warehouse`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `company_id_1_name_1`: `{"company_id": 1, "name": 1}`
- **Field Types & Schema**:
  - `company_id`: BSON `string`
  - `name`: BSON `string`
  - `location`: BSON `string` (optional)
  - `created_at`: BSON `date`

### 4.6 Collection: `workers`
- **MongoEngine Class**: `worker.models.Worker`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `name_1`: `{"name": 1}`
  - `joining_date_idx`: `{"joining_date": 1}`
- **Field Types & Schema**:
  - `company_id`: BSON `string`
  - `name`: BSON `string`
  - `age`: BSON `int` or `null`
  - `image_url`: BSON `string` or `null`
  - `address`: BSON `string` or `null`
  - `phone`: BSON `string` or `null`
  - `joining_date`: BSON `date`
  - `is_active`: BSON `bool` (default: true)
  - `created_at`: BSON `date`
  - `updated_at`: BSON `date`

### 4.7 Collection: `material_assignments`
- **MongoEngine Class**: `worker.models.MaterialAssignment`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `worker_1`: `{"worker": 1}`
  - `assignment_date_idx`: `{"assignment_date": 1}`
  - `material_name_idx`: `{"material_name": 1}`
  - `status_idx`: `{"status": 1}`
  - `bill_id_idx`: `{"bill_id": 1}`
- **Field Types & Schema**:
  - `company_id`: BSON `string`
  - `worker`: BSON `ObjectId` (DBRef / ObjectId reference to `Worker`)
  - `material_name`: BSON `string`
  - `quantity`: BSON `int`
  - `price_per_unit`: BSON `double`
  - `assignment_date`: BSON `date`
  - `notes`: BSON `string` or `null`
  - `batches`: BSON `array` of `object` (`quantity`, `date`, `notes`)
  - `status`: BSON `string` (`"open"` or `"completed"`)
  - `completed_at`: BSON `date` or `null`
  - `wastage_quantity`: BSON `int` or `null`
  - `bill_id`: BSON `string` or `null`
  - `wage_amount`: BSON `double` (default: 0.0)
  - `pay_record_id`: BSON `string` or `null`
  - `synced_to_inventory`: BSON `bool` (default: false)
  - `created_at`: BSON `date`
  - `updated_at`: BSON `date`

### 4.8 Collection: `pay_records`
- **MongoEngine Class**: `worker.models.PayRecord`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `worker_1`: `{"worker": 1}`
  - `paid_1`: `{"paid": 1}`
  - `date_idx`: `{"date": 1}`
  - `pay_bill_id_idx`: `{"bill_id": 1}`
- **Field Types & Schema**:
  - `company_id`: BSON `string`
  - `worker`: BSON `ObjectId` (Reference to `Worker`)
  - `product_name`: BSON `string`
  - `units_produced`: BSON `int`
  - `rate_per_unit`: BSON `double`
  - `amount_paid`: BSON `double` (default: 0.0)
  - `date`: BSON `date`
  - `paid`: BSON `bool` (default: false)
  - `bill_id`: BSON `string` or `null`
  - `source_assignment_id`: BSON `string` or `null`
  - `created_at`: BSON `date`
  - `updated_at`: BSON `date`

### 4.9 Collection: `business_data`
- **MongoEngine Class**: `upload.models.BusinessData`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `company_id_1`: `{"company_id": 1}`
  - `date_1`: `{"date": 1}`
  - `product_1`: `{"product": 1}`
  - `category_1`: `{"category": 1}`
  - `date_region_idx`: `{"date": 1, "region": 1}`
- **Field Types & Schema**:
  - `company_id`: BSON `string`
  - `date`: BSON `date` (Stored as midnight UTC Date by MongoEngine)
  - `product`: BSON `string`
  - `category`: BSON `string`
  - `quantity`: BSON `int`
  - `production_cost`: BSON `double`
  - `selling_price`: BSON `double`
  - `region`: BSON `string`
  - `customer_type`: BSON `string` (`"Retail"`, `"Wholesale"`, `"Online"`)

### 4.10 Collection: `insights`
- **MongoEngine Class**: `insights.models.Insight`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `expires_at_1`: `{"expires_at": 1}`, **`expireAfterSeconds: 0`** (MongoDB TTL index!)
  - `company_id_1`: `{"company_id": 1}`
- **Field Types & Schema**:
  - `company_id`: BSON `string`
  - `title`: BSON `string`
  - `description`: BSON `string`
  - `labels`: BSON `array` of `string`
  - `data_points`: BSON `array` of `double`
  - `note`: BSON `string` (optional)
  - `created_at`: BSON `date`
  - `expires_at`: BSON `date` (default: `created_at + 30 days`)

### 4.11 Collection: `financial_summaries`
- **MongoEngine Class**: `dashboard.models.FinancialSummary`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
  - `timestamp_-1`: `{"timestamp": -1}`
  - `company_id_1_timestamp_1`: `{"company_id": 1, "timestamp": 1}`, unique: true
  - `company_id_1`: `{"company_id": 1}`
- **Field Types & Schema**:
  - `company_id`: BSON `string`
  - `timestamp`: BSON `date`
  - `total_revenue`: BSON `Decimal128` (MongoEngine `DecimalField(precision=2)`)
  - `total_profit`: BSON `Decimal128`
  - `worker_payments`: BSON `Decimal128`
  - `active_workers`: BSON `int`

### 4.12 Collection: `contact_message`
- **MongoEngine Class**: `landing.mongo_models.ContactMessage`
- **Indexes**:
  - `_id_`: `{"_id": 1}`
- **Field Types & Schema**:
  - `name`: BSON `string`
  - `email`: BSON `string`
  - `message`: BSON `string`
  - `created_at`: BSON `date`
