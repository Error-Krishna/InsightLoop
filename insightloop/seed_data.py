import os
import random
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional in some environments
    load_dotenv = None

ROOT = Path(__file__).resolve().parent
if load_dotenv is not None:
    load_dotenv(ROOT / ".env")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "insightloop.settings")
sys.path.insert(0, str(ROOT))

import django

django.setup()

from landing.mongo_models import Company, ContactMessage, User
from bills.models import Bill
from dashboard.models import FinancialSummary
from insights.models import Insight
from inventory.models import InventoryItem, Warehouse
from upload.models import BusinessData
from worker.models import MaterialAssignment, PayRecord, Worker

random.seed(42)

PRODUCTS = [
    {"name": "Laptop", "category": "Electronics", "unit": "pcs", "cost": 42000, "price": 59000},
    {"name": "Smartphone", "category": "Electronics", "unit": "pcs", "cost": 18000, "price": 24999},
    {"name": "Monitor", "category": "Electronics", "unit": "pcs", "cost": 12000, "price": 16999},
    {"name": "Keyboard", "category": "Accessories", "unit": "pcs", "cost": 1800, "price": 2499},
    {"name": "Mouse", "category": "Accessories", "unit": "pcs", "cost": 900, "price": 1299},
    {"name": "Headphones", "category": "Accessories", "unit": "pcs", "cost": 2500, "price": 3999},
    {"name": "Office Chair", "category": "Furniture", "unit": "pcs", "cost": 6500, "price": 8999},
    {"name": "Study Table", "category": "Furniture", "unit": "pcs", "cost": 11000, "price": 15499},
    {"name": "Desk Lamp", "category": "Furniture", "unit": "pcs", "cost": 1400, "price": 1999},
    {"name": "Air Cooler", "category": "Appliances", "unit": "pcs", "cost": 6500, "price": 8999},
    {"name": "Water Bottle", "category": "Lifestyle", "unit": "pcs", "cost": 220, "price": 399},
    {"name": "Backpack", "category": "Lifestyle", "unit": "pcs", "cost": 1500, "price": 2499},
]

CATEGORIES = ["Electronics", "Furniture", "Accessories", "Appliances", "Lifestyle"]
REGIONS = ["North", "South", "East", "West", "Central"]
CUSTOMER_TYPES = ["Retail", "Wholesale", "Online"]
MATERIALS = ["Cotton", "Wood", "Steel", "Plastic", "Rubber", "Aluminum"]
WORKER_NAMES = [
    "Ramesh Kumar",
    "Suresh Singh",
    "Priya Sharma",
    "Amit Patel",
    "Neha Gupta",
    "Vikram Rao",
    "Anita Desai",
    "Karan Mehta",
    "Riya Joshi",
    "Deepak Verma",
]
BUYERS = [
    "Sharma Traders",
    "Patel Enterprises",
    "Singh & Co",
    "Kumar Retail",
    "Gupta Wholesale",
    "Mohan Supplies",
    "Apex Distribution",
]


def rnd(a, b):
    return round(random.uniform(a, b), 2)


def days_ago(n):
    return datetime.now() - timedelta(days=n)


def pick(items):
    return random.choice(items)


def clear_existing_data():
    print("Clearing existing seed data...")
    for model in [
        MaterialAssignment,
        PayRecord,
        Worker,
        BusinessData,
        Bill,
        InventoryItem,
        Warehouse,
        Insight,
        FinancialSummary,
        ContactMessage,
        User,
        Company,
    ]:
        try:
            model.objects.all().delete()
        except Exception as exc:  # pragma: no cover - defensive for environment differences
            print(f"  - skipped {model.__name__}: {exc}")


def create_company_and_users():
    print("Creating company and users...")
    company = Company(
        name="InsightLoop Demo Corp",
        business_type="Manufacturing & Distribution",
        email="demo@insightloop.dev",
        address="42, Industrial Avenue, Mumbai",
        phone="9876543210",
        gst_number="22AAAAA0000A1Z5",
        bank_name="HDFC Bank",
        ifsc_code="HDFC0001234",
        bank_account_number="50100123456789",
        branch_name="Mumbai Main",
        workspace_settings={
            "realtime_dashboard_refresh": True,
            "jwt_session_authentication": True,
            "ai_assistant_enabled": True,
            "inventory_workspace_mode": True,
        },
    ).save()

    primary_user = User(
        company=company,
        name="Aarav Patel",
        email="aarav@insightloop.dev",
        username="aarav",
        phone="9876543210",
        location="Mumbai",
        subscription="Pro Plan (₹499/mo)",
        notifications={
            "comments": True,
            "weekly_summary": True,
            "updates": True,
        },
    )
    primary_user.set_password("demo1234")
    primary_user.save()

    secondary_user = User(
        company=company,
        name="Nisha Rao",
        email="nisha@insightloop.dev",
        username="nisha",
        phone="9765432109",
        location="Delhi",
        subscription="Enterprise Plan (₹999/mo)",
        notifications={
            "comments": True,
            "weekly_summary": False,
            "updates": True,
        },
    )
    secondary_user.set_password("demo1234")
    secondary_user.save()

    return company


def create_warehouses(company_id):
    print("Creating warehouses...")
    warehouses = []
    for name, location in [
        ("Mumbai Warehouse", "Mumbai, MH"),
        ("Delhi Warehouse", "Delhi, DL"),
        ("Bengaluru Warehouse", "Bengaluru, KA"),
    ]:
        warehouse = Warehouse(company_id=company_id, name=name, location=location).save()
        warehouses.append(warehouse)
    return warehouses


def create_inventory(company_id, warehouses):
    print("Creating inventory items...")
    for index, product in enumerate(PRODUCTS):
        warehouse = warehouses[index % len(warehouses)]
        InventoryItem(
            company_id=company_id,
            name=product["name"],
            unit=product["unit"],
            type="finished" if index < 8 else "raw" if index < 10 else "semi_finished",
            selling_price=product["price"],
            cost_price=product["cost"],
            quantity=random.randint(20, 400),
            reorder_level=random.randint(10, 45),
            warehouse_id=str(warehouse.id),
        ).save()


def create_workers(company_id):
    print("Creating workers...")
    workers = []
    for index, name in enumerate(WORKER_NAMES):
        worker = Worker(
            company_id=company_id,
            name=name,
            age=random.randint(22, 48),
            phone=f"98765{43000 + index}",
            address=f"{index + 1} Worker Colony, {pick(['Mumbai', 'Delhi', 'Pune', 'Hyderabad'])}",
            joining_date=days_ago(random.randint(90, 800)),
            is_active=random.choice([True, True, False]),
        ).save()
        workers.append(worker)
    return workers


def create_worker_operations(company_id, workers):
    print("Creating worker material assignments and pay records...")
    for worker in workers:
        for _ in range(3):
            qty = random.randint(60, 220)
            delivered = random.randint(20, qty)
            batches = [
                {
                    "quantity": delivered,
                    "date": days_ago(5).strftime("%Y-%m-%d"),
                    "created_at": days_ago(5).isoformat(),
                },
                {
                    "quantity": max(qty - delivered, 0),
                    "date": days_ago(2).strftime("%Y-%m-%d"),
                    "created_at": days_ago(2).isoformat(),
                },
            ]
            MaterialAssignment(
                company_id=company_id,
                worker=worker,
                material_name=pick(MATERIALS),
                quantity=qty,
                price_per_unit=rnd(10, 90),
                assignment_date=days_ago(random.randint(3, 45)),
                batches=batches,
                notes=pick(["Routine issue", "Priority order", "Weekend dispatch", "Quality check"]),
            ).save()

        for _ in range(4):
            units = random.randint(15, 120)
            rate = rnd(12, 55)
            paid = random.choice([True, False])
            PayRecord(
                company_id=company_id,
                worker=worker,
                product_name=pick([p["name"] for p in PRODUCTS]),
                units_produced=units,
                rate_per_unit=rate,
                amount_paid=round(units * rate, 2) if paid else 0,
                paid=paid,
                date=days_ago(random.randint(1, 90)),
            ).save()


def create_business_data(company_id):
    print("Creating business data rows...")
    for _ in range(80):
        product = pick(PRODUCTS)
        qty = random.randint(5, 80)
        cost = float(product["cost"])
        price = float(product["price"])
        BusinessData(
            company_id=company_id,
            date=days_ago(random.randint(1, 180)).date(),
            product=product["name"],
            category=product["category"],
            quantity=qty,
            production_cost=round(cost * 0.8 + rnd(0, 400), 2),
            selling_price=round(price * 0.95 + rnd(0, 300), 2),
            region=pick(REGIONS),
            customer_type=pick(CUSTOMER_TYPES),
        ).save()


def create_bills(company_id):
    print("Creating bills...")
    for index in range(18):
        bill_type = "pakka" if index % 2 == 0 else "kacha"
        product_items = []
        subtotal = 0
        for _ in range(random.randint(2, 4)):
            product = pick(PRODUCTS)
            qty = random.randint(1, 6)
            rate = product["price"]
            total = round(qty * rate, 2)
            subtotal += total
            product_items.append({
                "name": product["name"],
                "quantity": qty,
                "rate": round(rate, 2),
                "unit": "pcs",
                "total": total,
            })
        discount = round(subtotal * random.uniform(0.01, 0.12), 2)
        taxable = round(max(subtotal - discount, 0), 2)
        gst_percentage = 18 if bill_type == "pakka" else 0
        gst_amount = round(taxable * gst_percentage / 100, 2)
        grand_total = round(taxable + gst_amount, 2)
        Bill(
            company_id=company_id,
            bill_type=bill_type,
            buyer={
                "name": pick(BUYERS),
                "address": pick(["Mumbai", "Delhi", "Pune", "Bengaluru"]),
                "gst_number": "22AAAAA0000A1Z5",
            },
            products=product_items,
            subtotal=round(subtotal, 2),
            gst_percentage=gst_percentage,
            gst_amount=gst_amount,
            discount=discount,
            grand_total=grand_total,
        ).save()


def create_financial_summaries(company_id, workers):
    print("Creating financial summaries...")
    for idx in range(6):
        base = Decimal(str(120000 + idx * 45000 + random.randint(10000, 35000)))
        profit = base * Decimal("0.32")
        FinancialSummary(
            company_id=company_id,
            timestamp=days_ago(idx * 30),
            total_revenue=base,
            total_profit=profit,
            worker_payments=Decimal(str(18000 + idx * 2500 + random.randint(1000, 5000))),
            active_workers=len(workers),
        ).save()


def create_insights(company_id):
    print("Creating insights...")
    insight_sets = [
        ("Revenue Spike", "Revenue accelerated in the last 30 days due to strong wholesale orders.", ["Jan", "Feb", "Mar", "Apr", "May"], [12000, 14500, 16800, 18200, 22100]),
        ("Top Product", "Laptops remain the strongest seller across the last two quarters.", ["Mon", "Tue", "Wed", "Thu", "Fri"], [1400, 1900, 2200, 1800, 2600]),
        ("Cost Trend", "Material costs are trending upward for steel and aluminum inputs.", ["Q1", "Q2", "Q3", "Q4"], [7600, 8100, 8900, 9400]),
        ("Regional Sales", "Southern and western regions are outperforming the rest of the network.", ["North", "South", "East", "West", "Central"], [4000, 6600, 4300, 6100, 5000]),
        ("Worker Output", "Daily productivity peaked for the top-performing teams after the new shift plan.", ["W1", "W2", "W3", "W4", "W5"], [540, 610, 690, 760, 820]),
        ("Inventory Health", "High-velocity items are consistently above reorder thresholds.", ["A", "B", "C", "D", "E"], [32, 41, 56, 63, 71]),
    ]
    for index, (title, description, labels, values) in enumerate(insight_sets, start=1):
        Insight(
            company_id=company_id,
            title=f"Insight {index}: {title}",
            description=description,
            labels=labels,
            data_points=[float(value) for value in values],
            note="Auto-generated from the seeded demo dataset.",
        ).save()


def create_contact_messages(company_id):
    print("Creating contact messages...")
    for index in range(6):
        ContactMessage(
            name=pick(["Anaya", "Meera", "Harsh", "Kavya", "Rohan", "Nikhil"]),
            email=f"lead{index + 1}@example.com",
            message=pick([
                "Would love to see a demo of the dashboard analytics.",
                "We are evaluating inventory automation for multiple warehouses.",
                "Can your team help us connect the billing workflow to our ERP?",
                "We need a better view of procurement and worker productivity.",
            ]),
        ).save()


def main():
    clear_existing_data()
    company = create_company_and_users()
    warehouses = create_warehouses(str(company.company_id))
    create_inventory(str(company.company_id), warehouses)
    workers = create_workers(str(company.company_id))
    create_worker_operations(str(company.company_id), workers)
    create_business_data(str(company.company_id))
    create_bills(str(company.company_id))
    create_financial_summaries(str(company.company_id), workers)
    create_insights(str(company.company_id))
    create_contact_messages(str(company.company_id))

    print("\n✅ Seed complete!")
    print(f"   Login email:    aarav@insightloop.dev")
    print(f"   Login password: demo1234")
    print(f"   Company ID:     {company.company_id}")


if __name__ == "__main__":
    main()
