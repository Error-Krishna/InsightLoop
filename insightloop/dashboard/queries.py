from .models import FinancialSummary
from datetime import datetime, timedelta
from mongoengine.queryset.visitor import Q
import calendar

from .models import WorkerPayment, Worker
from datetime import datetime, timedelta
from mongoengine.queryset.visitor import Q

def get_top_workers(months=3, limit=5):
    """
    Get top workers by total payout in the specified time period
    
    Args:
        months: Number of months to look back (default: 3)
        limit: Number of top workers to return (default: 5)
    
    Returns:
        [
            {
                "name": "Worker Name",
                "total_payout": 15000.00,
                "payment_count": 3,
                "latest_payment": "2023-05-15"
            },
            ...
        ]
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30*months)
    
    pipeline = [
        # Filter by date and paid status
        {'$match': {
            'payment_date': {'$gte': start_date, '$lte': end_date},
            'status': 'Paid'
        }},
        
        # Group by worker and calculate totals
        {'$group': {
            '_id': '$worker',
            'total_payout': {'$sum': '$amount'},
            'payment_count': {'$sum': 1},
            'latest_payment': {'$max': '$payment_date'}
        }},
        
        # Sort by highest payout
        {'$sort': {'total_payout': -1}},
        
        # Limit results
        {'$limit': limit},
        
        # Join with workers collection
        {'$lookup': {
            'from': 'workers',
            'localField': '_id',
            'foreignField': '_id',
            'as': 'worker'
        }},
        
        # Unwind the worker array
        {'$unwind': '$worker'},
        
        # Project final structure
        {'$project': {
            '_id': 0,
            'name': '$worker.name',
            'contact': '$worker.contact',
            'total_payout': 1,
            'payment_count': 1,
            'latest_payment': {
                '$dateToString': {
                    'format': '%Y-%m-%d',
                    'date': '$latest_payment'
                }
            }
        }}
    ]
    
    results = WorkerPayment._get_collection().aggregate(pipeline)
    workers = list(results)
    
    # Convert Decimal to float
    for worker in workers:
        worker['total_payout'] = float(worker['total_payout'])
    
    return workers
def get_rev_exp_data(months=6):
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30*months)
    
    # Use MongoDB aggregation for date handling
    pipeline = [
        {'$match': {'timestamp': {'$gte': start_date, '$lte': end_date}}},
        {'$addFields': {
            'month': {'$month': '$timestamp'},
            'year': {'$year': '$timestamp'}
        }},
        {'$group': {
            '_id': {'year': '$year', 'month': '$month'},
            'revenue': {'$sum': '$total_revenue'},
            'expenses': {'$sum': {'$subtract': ['$total_revenue', '$total_profit']}}
        }},
        {'$sort': {'_id.year': 1, '_id.month': 1}},
        {'$project': {
            '_id': 0,
            'month': {'$concat': [
                {'$toString': '$_id.year'},
                '-',
                {'$toString': '$_id.month'}
            ]},
            'revenue': 1,
            'expenses': 1
        }}
    ]
    
    results = FinancialSummary._get_collection().aggregate(pipeline)
    labels = []
    revenue = []
    expenses = []
    
    for r in results:
        labels.append(r['month'])
        revenue.append(float(r['revenue']))
        expenses.append(float(r['expenses']))
    
    # Fill in missing months with 0 values
    complete_labels = []
    complete_revenue = []
    complete_expenses = []
    
    current_date = start_date.replace(day=1)
    while current_date <= end_date:
        label = f"{current_date.year}-{current_date.month}"
        complete_labels.append(label)
        
        if label in labels:
            index = labels.index(label)
            complete_revenue.append(revenue[index])
            complete_expenses.append(expenses[index])
        else:
            complete_revenue.append(0.0)
            complete_expenses.append(0.0)
        
        # Move to next month
        if current_date.month == 12:
            current_date = current_date.replace(year=current_date.year+1, month=1)
        else:
            current_date = current_date.replace(month=current_date.month+1)
    
    return {
        'labels': complete_labels,
        'revenue': complete_revenue,
        'expenses': complete_expenses
    }

def get_profit_trends(months=6, interval='monthly'):
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30*months)
    
    # Determine grouping interval
    group_stage = {}
    if interval == 'monthly':
        group_stage = {
            '_id': {
                'year': {'$year': '$timestamp'},
                'month': {'$month': '$timestamp'}
            },
            'profit': {'$sum': '$total_profit'}
        }
    elif interval == 'weekly':
        group_stage = {
            '_id': {
                'year': {'$isoWeekYear': '$timestamp'},
                'week': {'$isoWeek': '$timestamp'}
            },
            'profit': {'$sum': '$total_profit'}
        }
    else:  # daily
        group_stage = {
            '_id': {
                'year': {'$year': '$timestamp'},
                'month': {'$month': '$timestamp'},
                'day': {'$dayOfMonth': '$timestamp'}
            },
            'profit': {'$sum': '$total_profit'}
        }
    
    pipeline = [
        {'$match': {'timestamp': {'$gte': start_date, '$lte': end_date}}},
        {'$group': group_stage},
        {'$sort': {'_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1}}
    ]
    
    results = FinancialSummary._get_collection().aggregate(pipeline)
    labels = []
    profits = []
    
    for r in results:
        if interval == 'monthly':
            labels.append(f"{r['_id']['year']}-{r['_id']['month']:02d}")
        elif interval == 'weekly':
            labels.append(f"Week {r['_id']['week']}, {r['_id']['year']}")
        else:
            month_name = calendar.month_abbr[r['_id']['month']]
            labels.append(f"{r['_id']['day']} {month_name} {r['_id']['year']}")
        
        profits.append(float(r['profit']))
    
    return {
        'labels': labels,
        'profit': profits,
        'interval': interval
    }