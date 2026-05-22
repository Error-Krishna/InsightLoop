from datetime import datetime

from mongoengine import Document, fields


def generate_invoice_number(company_id):
    """Generate a company-scoped invoice number with year prefix."""
    year = datetime.now().year
    prefix = f"INV-{year}-"
    latest = Bill.objects(company_id=company_id, invoice_number__startswith=prefix).order_by("-invoice_number").first()
    if latest and latest.invoice_number:
        try:
            sequence = int(latest.invoice_number.split("-")[-1]) + 1
        except (TypeError, ValueError):
            sequence = 1
    else:
        sequence = 1
    candidate = f"{prefix}{sequence:05d}"
    # Ensure uniqueness by incrementing if already exists
    while Bill.objects(company_id=company_id, invoice_number=candidate).count() > 0:
        sequence += 1
        candidate = f"{prefix}{sequence:05d}"
    return candidate


class Bill(Document):
    company_id = fields.StringField(required=True)
    bill_type = fields.StringField(required=True, choices=("kacha", "pakka"))
    buyer = fields.DictField(default=dict)
    products = fields.ListField(fields.DictField(), default=list)
    subtotal = fields.FloatField(required=True, default=0)
    gst_percentage = fields.FloatField(default=0)
    gst_amount = fields.FloatField(default=0)
    discount = fields.FloatField(default=0)
    grand_total = fields.FloatField(required=True, default=0)
    invoice_number = fields.StringField(required=True)
    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)

    meta = {
        "collection": "bills",
        "indexes": [
            {"fields": ["company_id", "bill_type"]},
            {"fields": ["company_id", "invoice_number"], "unique": True},
            "-created_at",
        ],
    }

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = generate_invoice_number(self.company_id)
        self.updated_at = datetime.now()
        return super().save(*args, **kwargs)