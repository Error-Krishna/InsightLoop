"""Deterministic test database seeder with strict runtime guards.

Seeds Company A (InsightLoop Demo Corp) and Company B (Tenant B Corp) into
InsightLoop_test only.
"""
import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

# Enforce strict safety guard
db_name = os.environ.get("MONGODB_DB_NAME", "")
uri = os.environ.get("MONGODB_URI", "")

if not db_name.endswith("_test"):
    raise RuntimeError(f"ABORTING: Refusing to seed non-test database: {db_name!r}. DB name MUST end in '_test'.")

if not ("localhost" in uri or "127.0.0.1" in uri):
    raise RuntimeError(f"ABORTING: Refusing to seed non-local database host: {uri!r}. Host MUST be local.")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "insightloop"))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "insightloop.settings")

import django
django.setup()

from landing.mongo_models import Company, User, ContactMessage
from bills.models import Bill
from dashboard.models import FinancialSummary
from insights.models import Insight
from inventory.models import InventoryItem, Warehouse
from upload.models import BusinessData
from worker.models import MaterialAssignment, PayRecord, Worker


def seed():
    print(f"Seeding test database: {db_name} at {uri}")

    # 1. Clean test collections
    for model in [
        MaterialAssignment, PayRecord, Worker, BusinessData, Bill,
        InventoryItem, Warehouse, Insight, FinancialSummary, ContactMessage,
        User, Company
    ]:
        model.objects.all().delete()

    # 2. Company A (Main Tenant)
    comp_a = Company(
        name="Company A Corp",
        business_type="Manufacturing",
        email="company_a@insightloop.dev",
        address="100 Test St, City A",
        phone="9876543210",
        gst_number="27AAAAA0000A1Z5",
        bank_name="Test Bank A",
        ifsc_code="TB0001",
        bank_account_number="1234567890",
        branch_name="Branch A",
        workspace_settings={
            "realtime_dashboard_refresh": True,
            "jwt_session_authentication": True,
            "ai_assistant_enabled": True,
            "inventory_workspace_mode": True,
        },
    ).save()

    user_a = User(
        company=comp_a,
        name="Alice Admin",
        email="alice@company-a.com",
        username="alice",
        phone="9876543210",
        location="City A",
        subscription="Pro Plan (₹499/mo)",
        notifications={"comments": True, "weekly_summary": True, "updates": True},
    )
    user_a.set_password("password123")
    user_a.save()

    # 3. Company B (Secondary Tenant for Tenancy Isolation Tests)
    comp_b = Company(
        name="Company B Ltd",
        business_type="Retail",
        email="company_b@insightloop.dev",
        address="200 Other St, City B",
        phone="9123456780",
        gst_number="27BBBBB0000B1Z5",
        workspace_settings={
            "realtime_dashboard_refresh": True,
            "jwt_session_authentication": True,
            "ai_assistant_enabled": True,
            "inventory_workspace_mode": True,
        },
    ).save()

    user_b = User(
        company=comp_b,
        name="Bob Admin",
        email="bob@company-b.com",
        username="bob",
        phone="9123456780",
        location="City B",
        subscription="Pro Plan (₹499/mo)",
        notifications={"comments": True, "weekly_summary": False, "updates": True},
    )
    user_b.set_password("password123")
    user_b.save()

    # 4. Warehouses for Company A
    wh_a1 = Warehouse(company_id=comp_a.company_id, name="Central Warehouse", location="City A").save()
    wh_a2 = Warehouse(company_id=comp_a.company_id, name="South Depot", location="City A South").save()

    # Warehouse for Company B
    wh_b1 = Warehouse(company_id=comp_b.company_id, name="Warehouse B", location="City B").save()

    # 5. Inventory Items for Company A
    item_finished = InventoryItem(
        company_id=comp_a.company_id,
        name="Finished Desk",
        unit="pcs",
        type="finished",
        selling_price=5000.0,
        cost_price=3000.0,
        quantity=50.0,
        reorder_level=10.0,
        warehouse_id=str(wh_a1.id),
        sku="SKU-00001",
    ).save()

    item_semi = InventoryItem(
        company_id=comp_a.company_id,
        name="Desk Frame",
        unit="pcs",
        type="semi_finished",
        selling_price=2000.0,
        cost_price=1200.0,
        quantity=30.0,
        reorder_level=5.0,
        warehouse_id=str(wh_a1.id),
        sku="SKU-00002",
    ).save()

    item_raw = InventoryItem(
        company_id=comp_a.company_id,
        name="Oak Timber",
        unit="kg",
        type="raw",
        selling_price=500.0,
        cost_price=300.0,
        quantity=200.0,
        reorder_level=20.0,
        warehouse_id=str(wh_a2.id),
        sku="SKU-00003",
    ).save()

    # Inventory Item for Company B
    item_b = InventoryItem(
        company_id=comp_b.company_id,
        name="Item B Private",
        unit="pcs",
        type="finished",
        selling_price=100.0,
        cost_price=50.0,
        quantity=10.0,
        sku="SKU-00001",
    ).save()

    ANCHOR_NOW = datetime(2026, 10, 14, 21, 0, 0)

    # 6. Workers for Company A
    worker_1 = Worker(
        company_id=comp_a.company_id,
        name="Ramesh Carpenter",
        age=35,
        address="Woodland St",
        phone="9988776655",
        joining_date=ANCHOR_NOW - timedelta(days=180),
        is_active=True,
    ).save()

    # Worker for Company B
    worker_b = Worker(
        company_id=comp_b.company_id,
        name="Worker B Private",
        age=40,
        joining_date=ANCHOR_NOW - timedelta(days=100),
        is_active=True,
    ).save()

    # 7. Material Assignment for Worker 1
    assignment_1 = MaterialAssignment(
        company_id=comp_a.company_id,
        worker=worker_1,
        material_name="Desk Assembly",
        quantity=20,
        price_per_unit=50.0,
        assignment_date=ANCHOR_NOW - timedelta(days=10),
        notes="Urgent consignment",
        batches=[{"quantity": 10, "date": (ANCHOR_NOW - timedelta(days=5)).isoformat(), "notes": "First chunk"}],
        status="open",
        wage_amount=500.0,
    ).save()

    # 8. Bills for Company A
    bill_kacha = Bill(
        company_id=comp_a.company_id,
        bill_type="kacha",
        buyer={"name": "Kacha Buyer", "address": "Market Rd", "phone": "9811223344"},
        products=[{
            "name": "Finished Desk",
            "description": "Standard",
            "quantity": 2.0,
            "rate": 5000.0,
            "unit": "pcs",
            "total": 10000.0,
            "inventory_item_id": str(item_finished.id),
        }],
        subtotal=10000.0,
        gst_percentage=0.0,
        gst_amount=0.0,
        discount=500.0,
        grand_total=9500.0,
        invoice_number="INV-2026-00001",
        payments=[{"amount": 5000.0, "date": (ANCHOR_NOW - timedelta(days=2)).isoformat(), "notes": "Advance"}],
        profit_confirmed=False,
        created_at=ANCHOR_NOW - timedelta(days=2),
    ).save()

    bill_pakka = Bill(
        company_id=comp_a.company_id,
        bill_type="pakka",
        buyer={"name": "Pakka Buyer Ltd", "address": "Corporate Park", "gst_number": "27AAAAA1234A1Z1", "phone": "9822334455"},
        products=[{
            "name": "Finished Desk",
            "description": "Premium",
            "quantity": 5.0,
            "rate": 6000.0,
            "unit": "pcs",
            "total": 30000.0,
            "inventory_item_id": str(item_finished.id),
        }],
        subtotal=30000.0,
        gst_percentage=18.0,
        gst_amount=5400.0,
        discount=0.0,
        grand_total=35400.0,
        invoice_number="INV-2026-00002",
        payments=[{"amount": 35400.0, "date": (ANCHOR_NOW - timedelta(days=1)).isoformat(), "notes": "Full payment"}],
        profit_confirmed=True,
        profit_suggested_amount=15000.0,
        profit_confirmed_amount=15000.0,
        profit_confirmed_at=ANCHOR_NOW - timedelta(days=1),
        created_at=ANCHOR_NOW - timedelta(days=1),
    ).save()

    # 9. BusinessData (Historical Sales) for Company A
    for i in range(1, 30):
        BusinessData(
            company_id=comp_a.company_id,
            date=(ANCHOR_NOW - timedelta(days=i * 2)).date(),
            product="Finished Desk",
            category="Furniture",
            quantity=5,
            production_cost=3000.0,
            selling_price=5000.0,
            region="North",
            customer_type="Wholesale",
        ).save()

    # 10. Insight for Company A
    Insight(
        company_id=comp_a.company_id,
        title="Sales Spike Detected",
        description="High volume sales in North region",
        labels=["09/01", "09/02", "09/03"],
        data_points=[10000.0, 25000.0, 30000.0],
        note="Q3 review",
        created_at=ANCHOR_NOW - timedelta(days=5),
        expires_at=ANCHOR_NOW + timedelta(days=25),
    ).save()

    print("Test database seeded successfully with deterministic fixtures for Company A and Company B.")
    print("Seed IDs:")
    print(f"  Company A ID: {comp_a.company_id}")
    print(f"  User A Email: alice@company-a.com / password123")
    print(f"  Company B ID: {comp_b.company_id}")
    print(f"  User B Email: bob@company-b.com / password123")
    print(f"  Finished Item A ID: {item_finished.id}")
    print(f"  Bill Kacha ID: {bill_kacha.id} (INV-2026-00001)")
    print(f"  Bill Pakka ID: {bill_pakka.id} (INV-2026-00002)")
    print(f"  Worker 1 ID: {worker_1.id}")
    print(f"  Assignment 1 ID: {assignment_1.id}")


if __name__ == "__main__":
    seed()
