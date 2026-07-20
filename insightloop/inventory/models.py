from datetime import datetime

from mongoengine import Document, fields


def generate_sku(company_id):
    """Generate a company-scoped SKU (e.g. each company starts at SKU-00001)."""
    prefix = "SKU"
    latest = (
        InventoryItem.objects(company_id=company_id)
        .order_by("-created_at")
        .first()
    )
    if latest and latest.sku and latest.sku.split("-")[-1].isdigit():
        sequence = int(latest.sku.split("-")[-1]) + 1
    else:
        sequence = 1
    candidate = f"{prefix}-{sequence:05d}"
    # Ensure uniqueness by incrementing if already exists
    while InventoryItem.objects(company_id=company_id, sku=candidate).count() > 0:
        sequence += 1
        candidate = f"{prefix}-{sequence:05d}"
    return candidate


class Warehouse(Document):
    company_id = fields.StringField(required=True)
    name = fields.StringField(required=True)
    location = fields.StringField(required=False)
    created_at = fields.DateTimeField(default=datetime.now)

    meta = {
        "collection": "warehouses",
        "indexes": [{"fields": ["company_id", "name"]}],
    }


class InventoryItem(Document):
    company_id = fields.StringField(required=True)
    name = fields.StringField(required=True)
    unit = fields.StringField(required=True, default="pcs")
    type = fields.StringField(required=True, choices=("finished", "semi_finished", "raw"))
    selling_price = fields.FloatField(default=0)
    cost_price = fields.FloatField(default=0)
    quantity = fields.FloatField(default=0)
    reorder_level = fields.FloatField(default=0)
    warehouse_id = fields.StringField(required=False)
    image_url = fields.StringField(required=False)
    sku = fields.StringField(required=True)
    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)

    meta = {
        "collection": "inventory_items",
        "indexes": [{"fields": ["company_id", "type"]}, {"fields": ["company_id", "sku"], "unique": True}],
    }

    def save(self, *args, **kwargs):
        if not self.sku:
            self.sku = generate_sku(self.company_id)
        self.updated_at = datetime.now()
        return super().save(*args, **kwargs)
