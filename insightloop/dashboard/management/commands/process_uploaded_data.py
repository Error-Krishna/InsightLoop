import calendar
from datetime import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from upload.models import BusinessData
from dashboard.models import FinancialSummary, Worker, WorkerPayment
from django.utils import timezone

class Command(BaseCommand):
    help = "Process uploaded business data to generate financial summaries and worker payments"

    def handle(self, *args, **options):
        self.stdout.write("Processing uploaded business data...")
        
        # Process financial summaries
        self.generate_financial_summaries()
        
        # Process worker payments
        self.generate_worker_payments()
        
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
            
            # Aggregate data for this month
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
                # Create financial summary
                FinancialSummary(
                    timestamp=end_date,
                    total_revenue=Decimal(str(monthly_data['total_revenue'])),
                    total_profit=Decimal(str(monthly_data['total_profit'])),
                    active_workers=0  # Will be updated later
                ).save()

    def generate_worker_payments(self):
        # Delete existing data
        Worker.objects.all().delete()
        WorkerPayment.objects.all().delete()
        
        # Create workers from unique regions
        regions = BusinessData.objects.distinct('region')
        workers = {}
        for region in regions:
            contact = f"CT-{region}"[:20]
            worker = Worker(name=f"Team {region}", contact=contact)
            worker.save()
            workers[region] = worker
        
        # Create payments (one per worker per month)
        pipeline = [
            {"$group": {
                "_id": {
                    "year": {"$year": "$date"},
                    "month": {"$month": "$date"},
                    "region": "$region"
                },
                "total_profit": {"$sum": "$profit"}
            }}
        ]
        results = BusinessData._get_collection().aggregate(pipeline)
        
        for data in results:
            region = data['_id']['region']
            year = data['_id']['year']
            month = data['_id']['month']
            
            amount = Decimal(str(data['total_profit'])) * Decimal('0.2')
            
            WorkerPayment(
                worker=workers[region],
                payment_date=datetime(year, month, 15),
                amount=amount,
                status='Paid'
            ).save()
        
        # Update active workers count in financial summaries
        for summary in FinancialSummary.objects.all():
            # Count all workers (since they're all active)
            active_workers_count = WorkerPayment.objects.count()
            summary.active_workers = active_workers_count
            summary.save()
            summary.active_workers = active_workers_count
            summary.save()