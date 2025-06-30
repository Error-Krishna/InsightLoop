from mongoengine import Document, fields

class BusinessData(Document):
    date = fields.DateField(required=True)
    product = fields.StringField(required=True, max_length=100)
    category = fields.StringField(max_length=50)
    quantity = fields.IntField(required=True)  # Number of units sold
    production_cost = fields.FloatField(required=True)  # Cost to produce one unit
    selling_price = fields.FloatField(required=True)  # Price per unit
    region = fields.StringField(max_length=50)
    customer_type = fields.StringField(max_length=20, choices=(
        ('Retail', 'Retail'),
        ('Wholesale', 'Wholesale'),
        ('Online', 'Online')
    ))

    meta = {
        'collection': 'business_data',
        'indexes': [
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