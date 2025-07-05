from .models import FinancialSummary
from upload.models import BusinessData
from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from worker.models import Worker
from worker.views import get_worker_total_payments

def process_uploaded_data(company_id):  # Added company_id parameter
    """Process raw business data into financial summaries"""
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Aggregate business data for this month
    pipeline = [
        {"$match": {
            "company_id": company_id,  # Added company_id filter
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
            "total_cost": {
                "$sum": {
                    "$multiply": ["$quantity", "$production_cost"]
                }
            }
        }}
    ]
    
    monthly_data = BusinessData._get_collection().aggregate(pipeline)
    result = next(monthly_data, None)
    
    # Calculate worker payments
    worker_payments = get_worker_total_payments(month_start, now, company_id)  # Pass company_id
    
    # Calculate gross profit (revenue - cost)
    gross_profit = Decimal(result['total_revenue'] - result['total_cost']) if result else Decimal(0)
    
    # Calculate net profit (gross profit - worker payments)
    net_profit = gross_profit - Decimal(worker_payments)
    
    # Create/update financial summary
    FinancialSummary.objects.update_or_create(
        company_id=company_id,  # Set company_id
        timestamp=month_start,
        defaults={
            'total_revenue': Decimal(result['total_revenue']) if result else Decimal(0),
            'total_profit': net_profit,
            'worker_payments': Decimal(worker_payments),
            'active_workers': get_active_workers_count(company_id)  # Pass company_id
        }
    )

def get_summary_data(company_id):  # Added company_id parameter
    """Get financial summary data without request dependency"""
    # Get latest summary
    summary = FinancialSummary.objects(company_id=company_id).order_by('-timestamp').first()
    
    if not summary:
        return {
            'total_revenue': 0.0,
            'total_profit': 0.0,
            'worker_payments': 0.0,
            'active_workers': get_active_workers_count(company_id),
            'revenue_change': 0.0,
            'profit_change': 0.0,
            'workers_change': get_workers_change(company_id)  # Pass company_id
        }
    
    # Calculate previous month range
    current_month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = current_month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)
    
    # Get previous month summary
    prev_month = FinancialSummary.objects(
        company_id=company_id,  # Filter by company_id
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
        'worker_payments': float(summary.worker_payments),
        'active_workers': get_active_workers_count(company_id),
        'revenue_change': calc_change(
            float(prev_month.total_revenue) if prev_month else 0.0,
            float(summary.total_revenue)
        ),
        'profit_change': calc_change(
            float(prev_month.total_profit) if prev_month else 0.0,
            float(summary.total_profit)
        ),
        'workers_change': get_workers_change(company_id)  # Pass company_id
    }

def get_active_workers_count(company_id):  # Added company_id parameter
    """Count active workers from worker collection"""
    return Worker.objects(company_id=company_id, is_active=True).count()

def get_workers_change(company_id):  # Added company_id parameter
    """Calculate percentage change in active workers"""
    now = timezone.now()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = current_month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1)
    
    # Get all active workers regardless of update time
    current_count = Worker.objects(company_id=company_id, is_active=True).count()
    
    # Get previous month count
    prev_count = Worker.objects(
        company_id=company_id,
        is_active=True,
        created_at__lt=current_month_start
    ).count()
    
    def calc_change(old, new):
        if old == 0 and new == 0: 
            return 0.0
        if old == 0: 
            return 100.0
        return float(round(((new - old) / old) * 100, 1))
    
    return calc_change(prev_count, current_count)