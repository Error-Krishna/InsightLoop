from datetime import datetime, time, timedelta
import calendar
from bills.models import Bill
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


def _bill_monthly_series(company_id, start_dt, end_dt):
    """Monthly {(year, month): (revenue, profit)} from confirmed bills only,
    keyed by when the bill's profit was confirmed -- that's the point at
    which it counts as recognized revenue/profit (see Bill.profit_confirmed).
    """
    pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "profit_confirmed": True,
                "profit_confirmed_at": {"$gte": start_dt, "$lte": end_dt},
            }
        },
        {
            "$group": {
                "_id": {"year": {"$year": "$profit_confirmed_at"}, "month": {"$month": "$profit_confirmed_at"}},
                "revenue": {"$sum": "$grand_total"},
                "profit": {"$sum": "$profit_confirmed_amount"},
            }
        },
    ]
    results = list(Bill._get_collection().aggregate(pipeline))
    series = {}
    for result in results:
        key = (result["_id"]["year"], result["_id"]["month"])
        series[key] = (float(result.get("revenue", 0) or 0), float(result.get("profit", 0) or 0))
    return series


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
    bill_series = _bill_monthly_series(company_id, start_dt, end_dt)

    # Merge uploaded-data months with confirmed-bill months so a month with
    # bill revenue but no uploaded rows (or vice versa) still shows up.
    combined = {}
    for result in results:
        key = (result['_id']['year'], result['_id']['month'])
        combined[key] = [float(result['total_revenue']), float(result['total_expenses'])]
    for key, (bill_revenue, bill_profit) in bill_series.items():
        if key not in combined:
            combined[key] = [0.0, 0.0]
        combined[key][0] += bill_revenue
        # "Expenses" here mirrors the uploaded-data cost basis; bills don't
        # track a separate expense figure, so it's derived from
        # revenue - profit for a consistent revenue/expense chart.
        combined[key][1] += max(bill_revenue - bill_profit, 0)

    labels = []
    revenue = []
    expenses = []
    for key in sorted(combined.keys()):
        year, month = key
        labels.append(f"{calendar.month_abbr[month]} {year}")
        revenue.append(round(combined[key][0], 2))
        expenses.append(round(combined[key][1], 2))

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

    # Only merge confirmed-bill profit in when using monthly granularity --
    # bills are keyed by confirmation month, not by day/week, so mixing them
    # into daily/weekly buckets would misattribute which day a bill's profit
    # "happened" on. Monthly is also the default and by far the most common
    # view (see get_dashboard_data), so this covers the main real-world case.
    if interval == 'monthly':
        bill_series = _bill_monthly_series(company_id, start_dt, end_dt)
        combined = {}
        for result in results:
            key = (result['_id']['year'], result['_id']['month'])
            combined[key] = float(result['total_profit'])
        for key, (_, bill_profit) in bill_series.items():
            combined[key] = combined.get(key, 0.0) + bill_profit

        labels = []
        profits = []
        for key in sorted(combined.keys()):
            year, month = key
            labels.append(f"{calendar.month_abbr[month]} {year}")
            profits.append(round(combined[key], 2))

        return {
            'labels': labels,
            'profit': profits,
            'interval': interval
        }

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
