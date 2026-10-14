"""Golden mathematical vectors generator for InsightLoop.

Produces executable truth fixtures from real Python functions to ensure 100%
compatibility in Node/TypeScript.
"""
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INSIGHTLOOP_DIR = ROOT / "insightloop"
sys.path.insert(0, str(INSIGHTLOOP_DIR))

# Safe test environment variables (Rule 7)
os.environ["MONGODB_URI"] = "mongodb://localhost:27017/InsightLoop_test"
os.environ["MONGODB_DB_NAME"] = "InsightLoop_test"
os.environ["DJANGO_SECRET_KEY"] = "test-secret-key-must-be-long-enough-32-chars"
os.environ["REDIS_URL"] = ""
os.environ["DJANGO_DEBUG"] = "true"
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "insightloop.settings")

import django

django.setup()

from bills.views import _build_bill_payload, _normalize_products, _stock_deltas
from dashboard.data_service import get_live_financial_summary


def generate_rounding_vectors():
    """Generate extensive test vectors for banker's rounding (round half to even)."""
    vectors = []
    
    # 1. Critical boundary cases (ties at 0, 1, 2, 3 decimal places)
    specific_cases = [
        # 0 decimals
        (0.5, 0), (1.5, 0), (2.5, 0), (3.5, 0), (-0.5, 0), (-1.5, 0), (-2.5, 0),
        # 1 decimal
        (0.05, 1), (0.15, 1), (0.25, 1), (0.35, 1), (-0.05, 1), (-0.15, 1), (-0.25, 1),
        # 2 decimals (common in money)
        (0.125, 2), (0.375, 2), (0.625, 2), (0.875, 2),
        (1.125, 2), (1.375, 2), (1.625, 2), (1.875, 2),
        (-0.125, 2), (-0.375, 2),
        # Floating point representation ties
        (0.1 + 0.2, 2), (1.005, 2), (2.005, 2), (1.055, 2), (1.255, 2),
        (10.125, 2), (100.125, 2), (1000.125, 2),
        (0.0, 2), (-0.0, 2), (100.0, 2), (99.999, 2),
    ]
    for val, digits in specific_cases:
        expected = round(val, digits)
        vectors.append({"input": val, "digits": digits, "expected": expected})

    # 2. Large generated grid (over 100,000 cases)
    # Testing fractional steps from -500 to 500
    for i in range(-50000, 50000):
        val = i * 0.0125  # produces many exact halves and eighths
        digits = abs(i) % 4
        expected = round(val, digits)
        vectors.append({"input": val, "digits": digits, "expected": expected})

    return vectors


def generate_bill_payload_vectors():
    """Matrix of product normalizations and bill totals."""
    test_inputs = [
        # 1. Basic happy path
        {
            "data": {
                "products": [
                    {"name": "Widget A", "quantity": 10, "rate": 50.0, "unit": "pcs", "inventory_item_id": "60a1b2c3d4e5f6a7b8c9d0e1"},
                    {"name": "Widget B", "quantity": 5, "price": 100.0, "unit": "pcs"},
                ],
                "discount": 50.0,
                "gst_percentage": 18.0,
                "buyer_name": "Acme Corp",
            },
            "bill_type": "pakka",
        },
        # 2. Kacha bill (forced gst=0)
        {
            "data": {
                "products": [
                    {"name": "Raw Steel", "quantity": 100, "unit_price": 42.5, "unit": "kg"},
                ],
                "discount": 0.0,
                "gst_percentage": 18.0,  # should be ignored for kacha
            },
            "bill_type": "kacha",
        },
        # 3. Discount exceeds subtotal (clamped at 0)
        {
            "data": {
                "products": [
                    {"name": "Discount Item", "quantity": 1, "rate": 100.0},
                ],
                "discount": 150.0,
                "gst_percentage": 18.0,
            },
            "bill_type": "pakka",
        },
        # 4. Empty products
        {
            "data": {
                "products": [],
                "discount": 0.0,
            },
            "bill_type": "pakka",
        },
        # 5. Alternate rate keys precedence (rate > price > unit_price)
        {
            "data": {
                "products": [
                    {"name": "Multi Key", "quantity": 2, "rate": 10.0, "price": 20.0, "unit_price": 30.0},
                ],
            },
            "bill_type": "pakka",
        },
        # 6. Fractional quantities and rates with floating point ties
        {
            "data": {
                "products": [
                    {"name": "Tie Item 1", "quantity": 2.5, "rate": 0.05},
                    {"name": "Tie Item 2", "quantity": 10.0, "rate": 12.345},
                ],
                "discount": 0.125,
                "gst_percentage": 5.0,
            },
            "bill_type": "pakka",
        },
    ]

    vectors = []
    for item in test_inputs:
        payload = _build_bill_payload(item["data"], item["bill_type"])
        deltas = _stock_deltas(payload["products"])
        vectors.append({
            "input": item,
            "expected_payload": payload,
            "expected_deltas": deltas,
        })
    return vectors


def generate_derived_properties_vectors():
    """Matrix of payment statuses, balance due, payment fraction, over_received."""
    cases = [
        # (grand_total, payments)
        (1000.0, []),
        (1000.0, [{"amount": 0.0}]),
        (1000.0, [{"amount": 500.0}]),
        (1000.0, [{"amount": 250.0}, {"amount": 250.0}]),
        (1000.0, [{"amount": 1000.0}]),
        (1000.0, [{"amount": 500.0}, {"amount": 500.0}]),
        (1000.0, [{"amount": 1200.0}]),  # over_received
        (0.0, []),
        (0.0, [{"amount": 50.0}]),
        (-100.0, []),
        (100.55, [{"amount": 50.25}, {"amount": 50.30}]),
    ]

    results = []
    for grand_total, payments in cases:
        amount_received = round(sum(p.get("amount", 0) for p in payments), 2)
        balance_due = round(max(grand_total - amount_received, 0), 2)
        over_received = amount_received > grand_total
        if grand_total <= 0:
            payment_status = "paid"
            payment_fraction = 0.0
        else:
            if amount_received <= 0:
                payment_status = "unpaid"
            elif amount_received >= grand_total:
                payment_status = "paid"
            else:
                payment_status = "partial"
            payment_fraction = min(amount_received / grand_total, 1.0)

        results.append({
            "grand_total": grand_total,
            "payments": payments,
            "expected": {
                "amount_received": amount_received,
                "balance_due": balance_due,
                "over_received": over_received,
                "payment_status": payment_status,
                "payment_fraction": round(payment_fraction, 4),
            }
        })
    return results


def generate_change_calc_vectors():
    """Month-over-month change percentage logic."""
    cases = [
        (0.0, 0.0),
        (0.0, 100.0),
        (100.0, 0.0),
        (100.0, 100.0),
        (100.0, 150.0),
        (100.0, 50.0),
        (250.0, 312.5),
        (83.33, 125.0),
    ]

    def calc_change(old, new):
        if old == 0 and new == 0:
            return 0.0
        if old == 0:
            return 100.0 if new > 0 else -100.0
        return float(round(((new - old) / abs(old)) * 100, 1))

    results = []
    for old, new in cases:
        results.append({
            "old": old,
            "new": new,
            "expected": calc_change(old, new),
        })
    return results


def main():
    print("Generating golden mathematical vectors from Python...")
    rounding_vectors = generate_rounding_vectors()
    print(f"Generated {len(rounding_vectors)} rounding vectors.")

    bill_vectors = generate_bill_payload_vectors()
    print(f"Generated {len(bill_vectors)} bill payload vectors.")

    derived_vectors = generate_derived_properties_vectors()
    print(f"Generated {len(derived_vectors)} derived bill property vectors.")

    change_vectors = generate_change_calc_vectors()
    print(f"Generated {len(change_vectors)} metric change vectors.")

    fixtures = {
        "metadata": {
            "generator": "scripts/generate_golden_vectors.py",
            "python_version": sys.version,
            "rounding_vector_count": len(rounding_vectors),
        },
        "rounding": rounding_vectors,
        "bill_payloads": bill_vectors,
        "bill_derived_properties": derived_vectors,
        "metric_change": change_vectors,
    }

    out_file = ROOT / "apps" / "api" / "test" / "contracts" / "fixtures" / "math_vectors.json"
    with open(out_file, "w") as f:
        json.dump(fixtures, f, indent=2)

    print(f"Successfully saved all vectors to {out_file} ({out_file.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
