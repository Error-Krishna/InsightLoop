from mongoengine import Document, fields
from django.conf import settings

class BusinessData(Document):
    company_id = fields.StringField(required=True)
    date = fields.DateField(required=True)
    product = fields.StringField(required=True, max_length=100)
    category = fields.StringField(max_length=50)
    quantity = fields.IntField(required=True)
    production_cost = fields.FloatField(required=True)
    selling_price = fields.FloatField(required=True)
    region = fields.StringField(max_length=50)
    customer_type = fields.StringField(max_length=20, choices=(
        ('Retail', 'Retail'),
        ('Wholesale', 'Wholesale'),
        ('Online', 'Online')
    ))

    meta = {
        'collection': 'business_data',
        'indexes': [
            {'fields': ['company_id']},  # Improved index
            'date',
            'product',
            'category',
            {'fields': ['date', 'region'], 'name': 'date_region_idx'}
        ]
    }

    @property
    def revenue(self):
        return self.quantity * self.selling_price

    @property
    def expense(self):
        return self.quantity * self.production_cost

    @property
    def profit(self):
        return self.revenue - self.expense