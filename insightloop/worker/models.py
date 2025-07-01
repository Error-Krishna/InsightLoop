from mongoengine import Document, fields
from datetime import datetime

class Worker(Document):
    name = fields.StringField(required=True)
    age = fields.IntField()
    image_url = fields.StringField()
    address = fields.StringField()
    phone = fields.StringField()
    joining_date = fields.DateTimeField(default=datetime.now)
    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)

    meta = {
        'collection': 'workers',
        'indexes': ['name']
    }

class MaterialAssignment(Document):
    worker = fields.ReferenceField(Worker)
    material_name = fields.StringField(required=True)
    quantity = fields.IntField(required=True)
    price_per_unit = fields.FloatField(required=True)
    assignment_date = fields.DateTimeField(required=True)
    notes = fields.StringField()
    batches = fields.ListField(fields.DictField())
    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)

    meta = {
        'collection': 'material_assignments',
        'indexes': ['worker']
    }

class PayRecord(Document):
    worker = fields.ReferenceField(Worker)
    product_name = fields.StringField(required=True)
    units_produced = fields.IntField(required=True)
    rate_per_unit = fields.FloatField(required=True)
    amount_paid = fields.FloatField(default=0)
    date = fields.DateTimeField(required=True)
    paid = fields.BooleanField(default=False)
    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)

    meta = {
        'collection': 'pay_records',
        'indexes': ['worker', 'paid']
    }