from mongoengine import Document, fields
from datetime import datetime, timedelta

class Insight(Document):
    title = fields.StringField(required=True, max_length=255)
    description = fields.StringField(required=True)
    labels = fields.ListField(fields.StringField(), default=list)
    data_points = fields.ListField(fields.FloatField(), default=list)
    note = fields.StringField()
    created_at = fields.DateTimeField(auto_now_add=True)
    expires_at = fields.DateTimeField(default=datetime.now() + timedelta(days=30))
    
    meta = {
        'collection': 'insights',
        'ordering': ['-created_at'],
        'indexes': [
            {'fields': ['expires_at'], 'expireAfterSeconds': 0}
        ]
    }

class SalesRecord(Document):
    date = fields.DateField(required=True, default=datetime.now)
    amount = fields.FloatField(required=True)
    product = fields.StringField(required=True, max_length=100)
    created_at = fields.DateTimeField(auto_now_add=True)
    
    meta = {
        'collection': 'sales_records',
        'ordering': ['-date']
    }