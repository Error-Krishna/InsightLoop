import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

# Add insightloop to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "insightloop"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "insightloop.settings")

import django
django.setup()

from django.template.loader import render_to_string
from weasyprint import HTML

OUTPUT_DIR = Path("docs/migration/evidence/pdf_parity")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

class MockBuyer:
    def __init__(self, name, address=None, gst_number=None, phone=None):
        self.name = name
        self.address = address
        self.gst_number = gst_number
        self.phone = phone

class MockProduct:
    def __init__(self, name, quantity, unit, rate, total, description=None):
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.rate = rate
        self.total = total
        self.description = description

class MockBill:
    def __init__(self, bill_type, invoice_number, created_at, buyer, products, subtotal, discount, gst_percentage, gst_amount, grand_total):
        self.bill_type = bill_type
        self.invoice_number = invoice_number
        self.created_at = created_at
        self.buyer = buyer
        self.products = products
        self.subtotal = subtotal
        self.discount = discount
        self.gst_percentage = gst_percentage
        self.gst_amount = gst_amount
        self.grand_total = grand_total

# 1. Bill 1: Pakka Standard
b1 = MockBill(
    bill_type="pakka",
    invoice_number="INV-2026-00001",
    created_at=datetime(2026, 10, 15),
    buyer=MockBuyer(
        name="Acme Industrial Supplies Pvt Ltd",
        address="Plot 42, Electronics City, Bengaluru 560100",
        gst_number="29ABCDE1234F1Z5",
        phone="+91 98765 43210"
    ),
    products=[
        MockProduct("Industrial Steel Flange 4-inch", 10.0, "pcs", 350.0, 3500.0, "Carbon steel class 150"),
        MockProduct("Rubber Gasket Ring", 20.0, "pcs", 45.0, 900.0, "High-temperature neoprene"),
        MockProduct("Galvanized Hex Bolt M16", 50.0, "pcs", 12.0, 600.0)
    ],
    subtotal=5000.0,
    discount=250.0,
    gst_percentage=18.0,
    gst_amount=855.0,
    grand_total=5605.0
)
c1 = {
    "name": "InsightLoop Engineering Works",
    "address": "100 Feet Road, Indiranagar, Bengaluru 560038",
    "gst_number": "29XYZAB5678C1Z2",
    "phone": "+91 80 4000 1234",
    "email": "billing@insightloop.io",
    "bank_name": "HDFC Bank",
    "branch_name": "Indiranagar",
    "bank_account_number": "50100012345678",
    "ifsc_code": "HDFC0001234"
}

# 2. Bill 2: Kacha No Logo
b2 = MockBill(
    bill_type="kacha",
    invoice_number="INV-2026-00002",
    created_at=datetime(2026, 10, 16),
    buyer=MockBuyer(
        name="Rajesh Hardware Stores",
        address="Shop 12, Main Market, Hubballi 580020",
        phone="9845012345"
    ),
    products=[
        MockProduct("Nylon Bushing 20mm", 15.0, "pcs", 60.0, 900.0),
        MockProduct("Brass Fitting 1/2-inch", 10.0, "pcs", 90.0, 900.0)
    ],
    subtotal=1800.0,
    discount=100.0,
    gst_percentage=0.0,
    gst_amount=0.0,
    grand_total=1700.0
)
c2 = {
    "name": "InsightLoop Engineering Works",
    "address": "100 Feet Road, Indiranagar, Bengaluru 560038",
    "phone": "+91 80 4000 1234",
    "email": "billing@insightloop.io",
    "bank_name": "State Bank of India",
    "branch_name": "MG Road",
    "bank_account_number": "30981234567",
    "ifsc_code": "SBIN0000567"
}

# 3. Bill 3: Pakka Multi-Page (28 products)
p3 = [
    MockProduct(f"Precision Machine Part #{i+1:02d}", float(i + 1), "pcs", float((i + 1) * 25), float((i + 1) * (i + 1) * 25))
    for i in range(28)
]
sub3 = sum(p.total for p in p3)
b3 = MockBill(
    bill_type="pakka",
    invoice_number="INV-2026-00003",
    created_at=datetime(2026, 10, 17),
    buyer=MockBuyer(
        name="Apex Heavy Manufacturing Corp",
        address="Industrial Area Phase II, Peenya, Bengaluru 560058",
        gst_number="29AAACA1234A1Z9",
        phone="080 2839 0000"
    ),
    products=p3,
    subtotal=sub3,
    discount=500.0,
    gst_percentage=12.0,
    gst_amount=round((sub3 - 500.0) * 0.12, 2),
    grand_total=round(sub3 - 500.0 + (sub3 - 500.0) * 0.12, 2)
)
c3 = c1

# 4. Bill 4: Kacha Multi-Page (26 products)
p4 = [
    MockProduct(f"Assembly Component X-{i+1:02d}", float(5 + i), "units", 40.0, float((5 + i) * 40))
    for i in range(26)
]
sub4 = sum(p.total for p in p4)
b4 = MockBill(
    bill_type="kacha",
    invoice_number="INV-2026-00004",
    created_at=datetime(2026, 10, 17),
    buyer=MockBuyer(
        name="Global Exports Co",
        address="Whitefield Tech Zone, Bengaluru"
    ),
    products=p4,
    subtotal=sub4,
    discount=0.0,
    gst_percentage=0.0,
    gst_amount=0.0,
    grand_total=sub4
)
c4 = c2

test_cases = [
    ("bill_1_pakka_standard", b1, c1),
    ("bill_2_kacha_no_logo", b2, c2),
    ("bill_3_pakka_multipage", b3, c3),
    ("bill_4_kacha_multipage", b4, c4)
]

print("Rendering Django PDFs with WeasyPrint...")
for name, bill, company in test_cases:
    html_content = render_to_string("bills/invoice.html", {"bill": bill, "company": company})
    pdf_path = OUTPUT_DIR / f"{name}_django.pdf"
    txt_path = OUTPUT_DIR / f"{name}_django.txt"
    png_prefix = OUTPUT_DIR / f"{name}_django_page"

    HTML(string=html_content).write_pdf(str(pdf_path))
    print(f"Generated {pdf_path} ({pdf_path.stat().st_size} bytes)")

    # Extract text with pdftotext -layout
    subprocess.run(["pdftotext", "-layout", str(pdf_path), str(txt_path)], check=True)
    print(f"Extracted {txt_path} ({txt_path.stat().st_size} bytes)")

    # Render PNGs with pdftoppm -png -r 150
    subprocess.run(["pdftoppm", "-png", "-r", "150", str(pdf_path), str(png_prefix)], check=True)
    print(f"Rendered PNGs with prefix {png_prefix}")

print("All Django PDFs, layout text, and PNGs successfully generated.")
