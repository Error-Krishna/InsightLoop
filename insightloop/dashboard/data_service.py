# dashboard/data_service.py
from .models import FinancialSummary, WorkerPayment
from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone

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
        'active_workers': summary.active_workers,
        'revenue_change': calc_change(
            float(prev_month.total_revenue) if prev_month else 0.0,
            float(summary.total_revenue)
        ),
        'profit_change': calc_change(
            float(prev_month.total_profit) if prev_month else 0.0,
            float(summary.total_profit)
        ),
        'workers_change': calc_change(
            prev_month.active_workers if prev_month else 0,
            summary.active_workers
        )
    }

def get_worker_payments(months=1):
    """Get worker payments without request dependency"""
    start_date = timezone.now() - timedelta(days=30*months)
    
    payments = WorkerPayment.objects.filter(
        payment_date__gte=start_date
    ).order_by('-payment_date')
    
    return [{
        'name': p.worker.name,
        'month': p.payment_date.strftime('%B %Y'),
        'amount': float(p.amount),  # Convert Decimal to float
        'status': p.status
    } for p in payments]