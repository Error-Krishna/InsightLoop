from mongoengine import Document, EmbeddedDocument
from mongoengine.fields import (
    StringField, DateTimeField, DecimalField,
    IntField, ReferenceField  
)


class FinancialSummary(Document):
    timestamp = DateTimeField(required=True)
    total_revenue = DecimalField(precision=2, required=True)
    total_profit = DecimalField(precision=2, required=True)
    active_workers = IntField(required=True)
    meta = {
        'collection': 'financial_summaries',
        'indexes': [
            '-timestamp',  # Descending timestamp index
            {'fields': ['timestamp'], 'expireAfterSeconds': 31536000}  # Optional TTL
        ]
    }
class Worker(Document):
    name = StringField(required=True, max_length=100)
    contact = StringField(max_length=20)
    meta = {'collection': 'workers'}

class WorkerPayment(Document):
    worker = ReferenceField(Worker, required=True)
    payment_date = DateTimeField(required=True)
    amount = DecimalField(precision=2, required=True)
    status = StringField(
        choices=('Paid', 'Pending', 'Not Paid'),
        default='Pending'
    )
    meta = {
        'collection': 'worker_payments',
        'indexes': [
            '-payment_date',
            'status',
            {'fields': ['payment_date'], 'expireAfterSeconds': 31536000}
        ]
    }