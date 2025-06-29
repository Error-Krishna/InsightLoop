from mongoengine import Document, fields

class BusinessData(Document):
    date = fields.DateField(required=True)
    product = fields.StringField(required=True, max_length=100)
    category = fields.StringField(max_length=50)
    sales = fields.IntField(required=True)
    profit = fields.FloatField(required=True)
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