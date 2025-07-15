import calendar
from datetime import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from upload.models import BusinessData
from dashboard.models import FinancialSummary
from django.utils import timezone

def generate_financial_summaries(company_id):
    # Convert to string for consistency
    company_id = str(company_id)
    
    # Check if any data exists first
    if not BusinessData.objects(company_id=company_id):
        raise ValueError("No data available to process. Please upload data first.")
    
    # Delete existing summaries for this company
    FinancialSummary.objects(company_id=company_id).delete()
    
    # Get distinct months with data for this company
    pipeline = [
        {"$match": {"company_id": company_id}},
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
        
        # Aggregate data for this month
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "date": {"$gte": start_date, "$lte": end_date}
            }},
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
                company_id=company_id,
                timestamp=end_date,
                total_revenue=Decimal(str(monthly_data['total_revenue'])),
                total_profit=Decimal(str(monthly_data['total_profit'])),
                worker_payments=Decimal('0'),
                active_workers=0
            ).save()

# Command wrapper remains for CLI usage
class Command(BaseCommand):
    help = "Process uploaded business data to generate financial summaries"
    
    def add_arguments(self, parser):
        parser.add_argument('company_id', type=str, help='Company ID for data processing')

    def handle(self, *args, **options):
        company_id = options['company_id']
        self.stdout.write(f"Processing uploaded business data for company: {company_id}...")
        generate_financial_summaries(company_id)
        self.stdout.write(self.style.SUCCESS("Data processing completed successfully!"))