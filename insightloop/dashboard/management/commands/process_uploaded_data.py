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
        # Delete existing summaries
        FinancialSummary.objects.all().delete()
        
        # Get distinct months with data
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
            
            # Calculate date range for this month
            start_date = datetime(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end_date = datetime(year, month, last_day)
            
            # Aggregate data for this month - UPDATED CALCULATION
            pipeline = [
                {"$match": {"date": {"$gte": start_date, "$lte": end_date}}},
                {"$group": {
                    "_id": None,
                    "total_revenue": {
                        "$sum": {
                            "$multiply": ["$quantity", "$selling_price"]
                        }
                    },
                    "total_expenses": {
                        "$sum": {
                            "$multiply": ["$quantity", "$production_cost"]
                        }
                    },
                    "total_profit": {
                        "$sum": {
                            "$subtract": [
                                {"$multiply": ["$quantity", "$selling_price"]},
                                {"$multiply": ["$quantity", "$production_cost"]}
                            ]
                        }
                    }
                }}
            ]
            result = BusinessData._get_collection().aggregate(pipeline)
            monthly_data = next(result, None)
            
            if monthly_data:
                # Create financial summary with calculated values
                FinancialSummary(
                    timestamp=end_date,
                    total_revenue=Decimal(str(monthly_data['total_revenue'])),
                    total_profit=Decimal(str(monthly_data['total_profit'])),
                    worker_payments=Decimal('0'),  # Add this line
                    active_workers=0
                ).save()