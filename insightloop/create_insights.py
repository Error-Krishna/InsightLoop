import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()

from insights.models import Insight

def create_insights():
    print("Creating sample insights...")
    Insight.objects.create(
        title="Sales Spike in April",
        description="Detected 45% increase in sales during April compared to previous months",
        labels=['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        data_points=[120, 140, 170, 250, 220, 190]
    )
    
    Insight.objects.create(
        title="Q1 Consumer Behavior",
        description="Notable shift towards premium products in Q1",
        labels=['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        data_points=[45, 52, 68, 72]
    )
    
    Insight.objects.create(
        title="Seasonal Demand Shift",
        description="Increased demand for warm clothing in winter months",
        labels=['Sep', 'Oct', 'Nov', 'Dec', 'Jan'],
        data_points=[80, 95, 120, 150, 140]
    )
    print("Created 3 sample insights")

if __name__ == "__main__":
    create_insights()