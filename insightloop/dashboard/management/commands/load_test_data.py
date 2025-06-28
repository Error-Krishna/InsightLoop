from django.core.management.base import BaseCommand
from dashboard.models import FinancialSummary, Worker, WorkerPayment
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone

class Command(BaseCommand):
    help = "Load test data into the database"

    def handle(self, *args, **kwargs):
        # Create workers
        workers = [
            Worker(name="Raj Sharma", contact="+919876543210"),
            Worker(name="Priya Patel", contact="+919876543211"),
            Worker(name="Amit Kumar", contact="+919876543212"),
            Worker(name="Sunita Singh", contact="+919876543213"),
            Worker(name="Vijay Verma", contact="+919876543214")
        ]
        for worker in workers:
            worker.save()

        # Create financial data for last 6 months
        today = timezone.now()
        for i in range(6):
            month_date = today - timedelta(days=30 * (6 - i))
            FinancialSummary.objects.create(
                timestamp=month_date,
                total_revenue=Decimal(150000 + i * 20000),
                total_profit=Decimal(45000 + i * 5000),
                active_workers=20 + i
            )

        # Create worker payments for last month
        for i, worker in enumerate(workers):
            payment_date = today - timedelta(days=7 * i)
            WorkerPayment.objects.create(
                worker=worker,
                payment_date=payment_date,
                amount=Decimal(10000 * (i + 1)),
                status="Paid" if i % 2 == 0 else "Pending"
            )

        # Create top worker payments
        for i in range(3):
            payment_date = today - timedelta(days=10 * i)
            WorkerPayment.objects.create(
                worker=workers[0],
                payment_date=payment_date,
                amount=Decimal(30000),
                status="Paid"
            )

        self.stdout.write(self.style.SUCCESS("Test data created successfully!"))
        self.stdout.write(f"Financial Summaries: {FinancialSummary.objects.count()}")
        self.stdout.write(f"Worker Payments: {WorkerPayment.objects.count()}")