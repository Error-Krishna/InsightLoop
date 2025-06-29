from django.core.management.base import BaseCommand
from insights.models import SalesRecord, Insight
from datetime import datetime, timedelta
import random
import numpy as np

class Command(BaseCommand):
    help = 'Generates test sales data and insights'

    def handle(self, *args, **kwargs):
        products = ['Widget A', 'Gadget B', 'Tool C', 'Accessory D']
        
        # Clear all existing data
        SalesRecord.objects.delete()
        Insight.objects.delete()

        # Generate 90 days of sales data
        start_date = datetime.now() - timedelta(days=90)
        for i in range(90):
            date = start_date + timedelta(days=i)
            
            # Spike sales every 7 days
            spike_factor = 3.0 if i % 7 == 0 else 1.0
            
            # Create 2-5 sales per day
            for _ in range(random.randint(2, 5)):
                SalesRecord(
                    date=date.date(),
                    amount=round(random.uniform(10, 100) * spike_factor, 2),
                    product=random.choice(products)
                ).save()

        # Generate test insights with expiration dates
        for i in range(20):
            days_old = random.randint(0, 60)  # Insights 0-60 days old
            created_at = datetime.now() - timedelta(days=days_old)
            
            # Create insights that will expire at different times
            Insight(
                title=f"Test Insight #{i+1}",
                description=f"Sample insight generated for testing ({days_old} days old)",
                labels=[f"Day {j}" for j in range(1, 8)],
                data_points=list(np.random.uniform(10, 100, 7)),
                note="This is a test insight that will expire automatically",
                created_at=created_at
            ).save()

        self.stdout.write(self.style.SUCCESS(
            'Created test sales data and 20 insights with expiration dates'
        ))