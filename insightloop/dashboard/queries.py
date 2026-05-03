from datetime import datetime, time, timedelta
import calendar
from upload.models import BusinessData
from django.utils import timezone


def _build_date_range(months):
    """
    MongoDB stores Django/MongoEngine DateField values as datetimes, so the
    aggregation match bounds must also be datetimes rather than date objects.
    """
    end_date = timezone.localdate()
    start_date = end_date - timedelta(days=30 * months)
    start_dt = datetime.combine(start_date, time.min)
    end_dt = datetime.combine(end_date, time.max)
    return start_dt, end_dt

def get_rev_exp_data(company_id, months=6):  # Added company_id parameter
    start_dt, end_dt = _build_date_range(months)
    
    pipeline = [
        {
            "$match": {
                "company_id": company_id,  # Added company_id filter
                "date": {
                    "$gte": start_dt,
                    "$lte": end_dt
                }
            }
        },
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$date"},
                    "month": {"$month": "$date"}
                },
                "total_revenue": {"$sum": {"$multiply": ["$quantity", "$selling_price"]}},
                "total_expenses": {"$sum": {"$multiply": ["$quantity", "$production_cost"]}},
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

def get_profit_trends(company_id, months=6, interval='monthly'):  # Added company_id parameter
    start_dt, end_dt = _build_date_range(months)
    
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
                "company_id": company_id,  # Added company_id filter
                "date": {
                    "$gte": start_dt,
                    "$lte": end_dt
                }
            }
        },
        {
            "$group": {
                "_id": group_id,
                "total_profit": {
                    "$sum": {
                        "$subtract": [
                            {"$multiply": ["$quantity", "$selling_price"]},
                            {"$multiply": ["$quantity", "$production_cost"]}
                        ]
                    }
                },
                "count": {"$sum": 1}
            }
        },
        {
            "$sort": {"_id.year": 1, "_id.month": 1, "_id.week": 1, "_id.day": 1}
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
            labels.append(f"{calendar.month_abbr[result['_id']['month']]} {result['_id']['year']}")
        
        profits.append(float(result['total_profit']))
    
    return {
        'labels': labels,
        'profit': profits,
        'interval': interval
    }
