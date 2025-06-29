import os
import sys

# Add project to Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
import django
django.setup()

from insights.models import Insight

def reset_insights():
    print("Deleting all insights...")
    Insight.objects.all().delete()
    
    print("Creating sample insights...")
    # Create sample insights
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
    reset_insights()