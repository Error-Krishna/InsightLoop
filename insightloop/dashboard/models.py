from datetime import datetime

from mongoengine import Document
from mongoengine.fields import DateTimeField, DecimalField, IntField, StringField


class FinancialSummary(Document):
    company_id = StringField(required=True)
    timestamp = DateTimeField(required=True, default=datetime.utcnow)
    total_revenue = DecimalField(precision=2, required=True, default=0)
    total_profit = DecimalField(precision=2, required=True, default=0)
    worker_payments = DecimalField(precision=2, required=True, default=0)
    active_workers = IntField(required=True, default=0)

    meta = {
        "collection": "financial_summaries",
        "indexes": [
            "-timestamp",
            {"fields": ["company_id", "timestamp"], "unique": True},
            {"fields": ["company_id"]},
        ],
        "ordering": ["-timestamp"],
    }
