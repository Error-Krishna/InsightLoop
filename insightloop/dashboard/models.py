from mongoengine import Document, EmbeddedDocument
from mongoengine.fields import (
    StringField, DateTimeField, DecimalField,
    IntField, ReferenceField  
)

class FinancialSummary(Document):
    company_id = StringField(required=True)  # Added company_id
    timestamp = DateTimeField(required=True)
    total_revenue = DecimalField(precision=2, required=True)
    total_profit = DecimalField(precision=2, required=True)
    worker_payments = DecimalField(precision=2, required=True)
    active_workers = IntField(required=True, default=0)
    meta = {
        'collection': 'financial_summaries',
        'indexes': [
            '-timestamp',
            {'fields': ['timestamp'], 'expireAfterSeconds': 31536000},
            {'fields': ['company_id']}  # Added index
    ]}

class Worker(Document):
    company_id = StringField(required=True)  # Added company_id
    name = StringField(required=True, max_length=100)
    contact = StringField(max_length=20)
    meta = {
        'collection': 'workers',
        'indexes': [
            {'fields': ['company_id']}  # Added index
    ]}

class WorkerPayment(Document):
    company_id = StringField(required=True)  # Added company_id
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
            {'fields': ['payment_date'], 'expireAfterSeconds': 31536000},
            {'fields': ['company_id']}  # Added index
    
    ]}