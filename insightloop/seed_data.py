import os, sys, json
from datetime import datetime, timedelta
from pathlib import Path
import random

# Load env
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "insightloop.settings")
sys.path.insert(0, str(Path(__file__).parent))
django.setup()

from mongoengine import connect
from django.conf import settings

# ── models ──────────────────────────────────────────────────────────────────
from landing.mongo_models import Company, User
from worker.models import Worker, MaterialAssignment, PayRecord
from upload.models import BusinessData
from bills.models import Bill
from inventory.models import Warehouse, InventoryItem
from insights.models import Insight
from dashboard.models import FinancialSummary

# ── helpers ─────────────────────────────────────────────────────────────────
def rnd(a, b): return round(random.uniform(a, b), 2)
def days_ago(n): return datetime.now() - timedelta(days=n)
def pick(lst): return random.choice(lst)

PRODUCTS = ["Laptop","Chair","Table","Phone","Headphones","Keyboard","Monitor","Desk","Lamp","Fan"]
CATEGORIES = ["Electronics","Furniture","Accessories"]
REGIONS = ["North","South","East","West"]
MATERIALS = ["Cotton","Wood","Steel","Plastic","Rubber"]

# ── wipe existing test data ──────────────────────────────────────────────────
print("Clearing old seed data...")
for Model in [PayRecord, MaterialAssignment, Worker, BusinessData, Bill,
              InventoryItem, Warehouse, Insight, FinancialSummary]:
    Model.objects.all().delete()
User.objects(email="test@test.com").delete()
Company.objects(email="test@test.com").delete()

# ── company + user ───────────────────────────────────────────────────────────
print("Creating company and user...")
company = Company(
    name="Acme Corp",
    email="test@test.com",
    address="123 Main Street, Mumbai",
    phone="9876543210",
    gst_number="22AAAAA0000A1Z5",
    bank_name="HDFC Bank",
    ifsc_code="HDFC0001234",
    bank_account_number="50100123456789",
    branch_name="Mumbai Main",
).save()

user = User(
    company=company,
    name="Test User",
    email="test@test.com",
    username="testuser",
    phone="9876543210",
)
user.set_password("test1234")
user.save()
cid = str(company.company_id)
print(f"  company_id: {cid}")

# ── warehouses ───────────────────────────────────────────────────────────────
print("Creating warehouses...")
warehouses = []
for name, loc in [("Mumbai Warehouse","Mumbai, MH"), ("Delhi Warehouse","Delhi, DL")]:
    warehouses.append(Warehouse(company_id=cid, name=name, location=loc).save())

# ── inventory ────────────────────────────────────────────────────────────────
print("Creating inventory items...")
for i, product in enumerate(PRODUCTS[:6]):
    InventoryItem(
        company_id=cid,
        name=product,
        unit="pcs",
        type="finished" if i < 4 else "raw",
        selling_price=rnd(500, 5000),
        cost_price=rnd(200, 2000),
        quantity=random.randint(10, 200),
        reorder_level=10,
        warehouse_id=str(warehouses[i % 2].id),
        sku="",
    ).save()

# ── workers ──────────────────────────────────────────────────────────────────
print("Creating workers...")
workers = []
names = ["Ramesh Kumar","Suresh Singh","Priya Sharma","Amit Patel","Neha Gupta"]
for i, name in enumerate(names):
    w = Worker(
        company_id=cid,
        name=name,
        age=random.randint(22, 45),
        phone=f"98765{43210+i}",
        address=f"{i+1} Worker Colony, Mumbai",
        joining_date=days_ago(random.randint(30, 500)),
        is_active=True,
    ).save()
    workers.append(w)

# ── material assignments ─────────────────────────────────────────────────────
print("Creating material assignments...")
for worker in workers:
    for _ in range(2):
        qty = random.randint(50, 200)
        delivered = random.randint(10, qty)
        batches = [{"quantity": delivered, "date": days_ago(5).strftime("%Y-%m-%d"), "created_at": days_ago(5).isoformat()}]
        MaterialAssignment(
            company_id=cid,
            worker=worker,
            material_name=pick(MATERIALS),
            quantity=qty,
            price_per_unit=rnd(10, 100),
            assignment_date=days_ago(random.randint(5, 30)),
            batches=batches,
            notes="Seed data",
        ).save()

# ── pay records ──────────────────────────────────────────────────────────────
print("Creating pay records...")
for worker in workers:
    for _ in range(3):
        units = random.randint(20, 100)
        rate = rnd(10, 50)
        paid_flag = random.choice([True, False])
        PayRecord(
            company_id=cid,
            worker=worker,
            product_name=pick(PRODUCTS),
            units_produced=units,
            rate_per_unit=rate,
            amount_paid=round(units * rate, 2) if paid_flag else 0,
            paid=paid_flag,
            date=days_ago(random.randint(1, 60)),
        ).save()

# ── business data ────────────────────────────────────────────────────────────
print("Creating business data...")
for i in range(20):
    qty = random.randint(5, 50)
    cost = rnd(100, 500)
    price = cost * rnd(1.2, 2.5)
    BusinessData(
        company_id=cid,
        date=days_ago(random.randint(1, 90)).date(),
        product=pick(PRODUCTS),
        category=pick(CATEGORIES),
        quantity=qty,
        production_cost=round(cost, 2),
        selling_price=round(price, 2),
        region=pick(REGIONS),
        customer_type=pick(["Retail","Wholesale","Online"]),
    ).save()

# ── bills ────────────────────────────────────────────────────────────────────
print("Creating bills...")
buyers = ["Sharma Traders","Patel Enterprises","Singh & Co","Kumar Retail","Gupta Wholesale"]
for i in range(10):
    btype = "pakka" if i % 2 == 0 else "kacha"
    products = [{"name": pick(PRODUCTS), "quantity": random.randint(1,10), "rate": rnd(100,2000), "unit":"pcs", "total": 0}]
    products[0]["total"] = round(products[0]["quantity"] * products[0]["rate"], 2)
    subtotal = products[0]["total"]
    gst_pct = 18 if btype == "pakka" else 0
    discount = rnd(0, subtotal * 0.1)
    taxable = max(subtotal - discount, 0)
    gst_amt = round(taxable * gst_pct / 100, 2)
    grand = round(taxable + gst_amt, 2)
    Bill(
        company_id=cid,
        bill_type=btype,
        buyer={"name": pick(buyers), "address": "Mumbai", "gst_number": "22AAAAA0000A1Z5"},
        products=products,
        subtotal=subtotal,
        gst_percentage=gst_pct,
        gst_amount=gst_amt,
        discount=discount,
        grand_total=grand,
        invoice_number=f"INV-2025-{i+1:05d}",
    ).save()

# ── financial summaries ───────────────────────────────────────────────────────
print("Creating financial summaries...")
from decimal import Decimal
for i in range(3):
    rev = Decimal(str(rnd(50000, 200000)))
    profit = rev * Decimal("0.3")
    FinancialSummary(
        company_id=cid,
        timestamp=days_ago(i * 30),
        total_revenue=rev,
        total_profit=profit,
        worker_payments=Decimal(str(rnd(5000, 20000))),
        active_workers=len(workers),
    ).save()

# ── insights ──────────────────────────────────────────────────────────────────
print("Creating insights...")
for i in range(5):
    labels = [(days_ago(30 - j*6)).strftime("%b %d") for j in range(5)]
    data_points = [rnd(1000, 50000) for _ in range(5)]
    Insight(
        company_id=cid,
        title=f"Insight {i+1}: {pick(['Revenue Spike','Top Product','Cost Trend','Regional Sales','Worker Output'])}",
        description="Auto-generated seed insight for testing purposes.",
        labels=labels,
        data_points=data_points,
    ).save()

# ── done ──────────────────────────────────────────────────────────────────────
print("\n✅ Seed complete!")
print(f"   Login email:    test@test.com")
print(f"   Login password: test1234")
print(f"   Company ID:     {cid}")
