from datetime import datetime

from mongoengine import Document, fields


def generate_invoice_number():
    year = datetime.now().year
    prefix = f"INV-{year}-"
    latest = Bill.objects(invoice_number__startswith=prefix).order_by("-created_at").first()
    if latest and latest.invoice_number:
        try:
            sequence = int(latest.invoice_number.split("-")[-1]) + 1
        except (TypeError, ValueError):
            sequence = 1
    else:
        sequence = 1
    return f"{prefix}{sequence:04d}"


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
    invoice_number = fields.StringField(required=True, unique=True)
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
            self.invoice_number = generate_invoice_number()
        self.updated_at = datetime.now()
        return super().save(*args, **kwargs)
