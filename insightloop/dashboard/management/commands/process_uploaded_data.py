import calendar
from datetime import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from upload.models import BusinessData
from dashboard.models import FinancialSummary
from django.utils import timezone

class Command(BaseCommand):
    help = "Process uploaded business data to generate financial summaries"

    def handle(self, *args, **options):
        self.stdout.write("Processing uploaded business data...")
        self.generate_financial_summaries()
        self.stdout.write(self.style.SUCCESS("Data processing completed successfully!"))

    def generate_financial_summaries(self):
        FinancialSummary.objects.all().delete()
        
        pipeline = [
            {"$group": {
                "_id": {
                    "year": {"$year": "$date"},
                    "month": {"$month": "$date"}
                }
            }}
        ]
        distinct_months = BusinessData._get_collection().aggregate(pipeline)
        
        for month_data in distinct_months:
            year = month_data['_id']['year']
            month = month_data['_id']['month']
            start_date = datetime(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end_date = datetime(year, month, last_day)
            
            pipeline = [
                {"$match": {"date": {"$gte": start_date, "$lte": end_date}}},
                {"$group": {
                    "_id": None,
                    "total_revenue": {"$sum": "$revenue"},
                    "total_profit": {"$sum": "$profit"}
                }}
            ]
            result = BusinessData._get_collection().aggregate(pipeline)
            monthly_data = next(result, None)
            
            if monthly_data:
                FinancialSummary(
                    timestamp=end_date,
                    total_revenue=Decimal(str(monthly_data['total_revenue'])),
                    total_profit=Decimal(str(monthly_data['total_profit'])),
                    active_workers=0
                ).save()