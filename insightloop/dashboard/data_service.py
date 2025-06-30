from .models import FinancialSummary
from upload.models import BusinessData
from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone

def process_uploaded_data():
    """Process raw business data into financial summaries"""
    # Calculate date range for this month
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Aggregate business data for this month - UPDATED CALCULATION
    pipeline = [
        {"$match": {
            "date": {
                "$gte": month_start,
                "$lte": now
            }
        }},
        {"$group": {
            "_id": None,
            "total_revenue": {
                "$sum": {
                    "$multiply": ["$quantity", "$selling_price"]
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
    
    monthly_data = BusinessData._get_collection().aggregate(pipeline)
    result = next(monthly_data, None)
    
    # Create or update financial summary
    FinancialSummary.objects.update_or_create(
        timestamp=month_start,
        defaults={
            'total_revenue': Decimal(str(result['total_revenue'])) if result else 0,
            'total_profit': Decimal(str(result['total_profit'])) if result else 0,
            'active_workers': 0  # Always 0 for now
        }
    )

def get_summary_data():
    """Get financial summary data without request dependency"""
    # Get latest summary
    summary = FinancialSummary.objects.order_by('-timestamp').first()
    
    if not summary:
        return {
            'total_revenue': 0.0,
            'total_profit': 0.0,
            'active_workers': 0,
            'revenue_change': 0.0,
            'profit_change': 0.0,
            'workers_change': 0.0
        }
    
    # Calculate previous month range using timezone-aware dates
    current_month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = current_month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)
    
    # Get previous month summary
    prev_month = FinancialSummary.objects.filter(
        timestamp__gte=prev_month_start,
        timestamp__lte=prev_month_end
    ).order_by('-timestamp').first()
    
    def calc_change(old, new):
        if old == 0 and new == 0:
            return 0.0
        if old == 0:
            return 100.0 if new > 0 else -100.0
        return float(round(((new - old) / abs(old)) * 100, 1))
    
    return {
        'total_revenue': float(summary.total_revenue),
        'total_profit': float(summary.total_profit),
        'active_workers': 0,  # Hardcoded to 0
        'revenue_change': calc_change(
            float(prev_month.total_revenue) if prev_month else 0.0,
            float(summary.total_revenue)
        ),
        'profit_change': calc_change(
            float(prev_month.total_profit) if prev_month else 0.0,
            float(summary.total_profit)
        ),
        'workers_change': 0.0  # Hardcoded to 0
    }