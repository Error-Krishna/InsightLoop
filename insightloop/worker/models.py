from mongoengine import Document, fields, ValidationError
from datetime import datetime

class Worker(Document):
    name = fields.StringField(required=True)
    age = fields.IntField()
    image_url = fields.StringField()
    address = fields.StringField()
    phone = fields.StringField()
    joining_date = fields.DateTimeField(default=datetime.now)
    is_active = fields.BooleanField(default=True)
    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)
    def __str__(self):
        return str(self.id)
    
    def delete(self, *args, **kwargs):
        # Delete related assignments and pay records
        MaterialAssignment.objects.filter(worker=self).delete()
        PayRecord.objects.filter(worker=self).delete()
        super().delete(*args, **kwargs)

    meta = {
        'collection': 'workers',
        'indexes': [
            'name',
            {'fields': ['joining_date'], 'name': 'joining_date_idx'}
        ]
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
        'indexes': [
            'worker',
            {'fields': ['assignment_date'], 'name': 'assignment_date_idx'},
            {'fields': ['material_name'], 'name': 'material_name_idx'}
        ]
    }
    
    @property
    def delivered_quantity(self):
        return sum(batch.get('quantity', 0) for batch in self.batches)
    
    @property
    def balance_quantity(self):
        return self.quantity - self.delivered_quantity
    
    @property
    def total_value(self):
        return self.quantity * self.price_per_unit
    
    def clean(self):
        """Validate data before saving"""
        if self.quantity <= 0:
            raise ValidationError("Quantity must be positive")
        if self.price_per_unit <= 0:
            raise ValidationError("Price must be positive")

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
        'indexes': [
            'worker', 
            'paid',
            {'fields': ['date'], 'name': 'date_idx'}
        ]
    }
    
    def clean(self):
        """Validate data before saving"""
        if self.units_produced <= 0:
            raise ValidationError("Units produced must be positive")
        if self.rate_per_unit <= 0:
            raise ValidationError("Rate per unit must be positive")