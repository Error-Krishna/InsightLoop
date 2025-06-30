from decimal import Decimal
from .models import FinancialSummary, WorkerPayment
from datetime import datetime, timedelta
import calendar
from upload.models import BusinessData
from django.utils import timezone

def get_rev_exp_data(months=6):
    end_date = timezone.now()
    start_date = end_date - timedelta(days=30*months)
    
    # Get data from BusinessData
    pipeline = [
        {
            "$match": {
                "date": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
        },
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$date"},
                    "month": {"$month": "$date"}
                },
                "total_revenue": {"$sum": "$revenue"},
                "total_expenses": {"$sum": {"$subtract": ["$revenue", "$profit"]}},
                "count": {"$sum": 1}
            }
        },
        {
            "$sort": {"_id.year": 1, "_id.month": 1}
        }
    ]
    
    results = list(BusinessData.objects.aggregate(*pipeline))
    
    labels = []
    revenue = []
    expenses = []
    
    for result in results:
        year = result['_id']['year']
        month = result['_id']['month']
        labels.append(f"{calendar.month_abbr[month]} {year}")
        revenue.append(float(result['total_revenue']))
        expenses.append(float(result['total_expenses']))
    
    return {
        'labels': labels,
        'revenue': revenue,
        'expenses': expenses
    }

def get_profit_trends(months=6, interval='monthly'):
    end_date = timezone.now()
    start_date = end_date - timedelta(days=30*months)
    
    # Determine grouping based on interval
    group_id = {}
    if interval == 'daily':
        group_id = {
            "year": {"$year": "$date"},
            "month": {"$month": "$date"},
            "day": {"$dayOfMonth": "$date"}
        }
    elif interval == 'weekly':
        group_id = {
            "year": {"$year": "$date"},
            "week": {"$week": "$date"}
        }
    else:  # monthly
        group_id = {
            "year": {"$year": "$date"},
            "month": {"$month": "$date"}
        }
    
    pipeline = [
        {
            "$match": {
                "date": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
        },
        {
            "$group": {
                "_id": group_id,
                "total_profit": {"$sum": "$profit"},
                "count": {"$sum": 1}
            }
        },
        {
            "$sort": {"_id.year": 1, "_id.month": 1}
        }
    ]
    
    results = list(BusinessData.objects.aggregate(*pipeline))
    
    labels = []
    profits = []
    
    for result in results:
        if interval == 'daily':
            labels.append(f"{result['_id']['day']}/{result['_id']['month']}")
        elif interval == 'weekly':
            labels.append(f"Week {result['_id']['week']}")
        else:  # monthly
            labels.append(f"{calendar.month_abbr[result['_id']['month']]}")
        
        profits.append(float(result['total_profit']))
    
    return {
        'labels': labels,
        'profit': profits,
        'interval': interval
    }

