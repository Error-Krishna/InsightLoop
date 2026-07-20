from datetime import datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from bills.models import Bill
from upload.models import BusinessData
from worker.models import PayRecord, Worker

from .models import FinancialSummary


def get_bill_financials(company_id, start_dt=None, end_dt=None):
    """Revenue and profit contributed by real bills, for the given window
    (or all-time if no window is given).

    Only bills the user has explicitly confirmed count toward either number
    -- see Bill.profit_confirmed. An unconfirmed bill (even one that's been
    fully paid) contributes nothing here, by design: the confirmation step
    is the single gate for both revenue and profit recognition, so the two
    numbers can never disagree about which bills they include.
    """
    query = Bill.objects(company_id=company_id, profit_confirmed=True)
    if start_dt is not None:
        query = query.filter(profit_confirmed_at__gte=start_dt)
    if end_dt is not None:
        query = query.filter(profit_confirmed_at__lte=end_dt)

    total_revenue = 0.0
    total_profit = 0.0
    # NOTE: amount_received is a computed Python property (sum of the
    # payments list), not a real MongoEngine field -- .only() only accepts
    # actual field names, so we fetch the real underlying fields it depends
    # on (payments, grand_total) plus profit_confirmed_amount directly.
    for bill in query.only("payments", "grand_total", "profit_confirmed_amount"):
        total_revenue += bill.amount_received
        total_profit += bill.profit_confirmed_amount or 0.0
    return round(total_revenue, 2), round(total_profit, 2)


def get_uploaded_data_financials(company_id, start_dt=None, end_dt=None):
    """Revenue and profit from uploaded/manual BusinessData records -- a
    separate, legitimate data source (bulk historical sales, data from
    before the user started billing through this app) that the user chose
    to combine with real-bill numbers on the dashboard.
    """
    match = {"company_id": company_id}
    if start_dt is not None or end_dt is not None:
        match["date"] = {}
        if start_dt is not None:
            match["date"]["$gte"] = start_dt
        if end_dt is not None:
            match["date"]["$lte"] = end_dt

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": None,
                "total_revenue": {"$sum": {"$multiply": ["$quantity", "$selling_price"]}},
                "total_cost": {"$sum": {"$multiply": ["$quantity", "$production_cost"]}},
            }
        },
    ]
    result = next(BusinessData._get_collection().aggregate(pipeline), None)
    total_revenue = (result or {}).get("total_revenue") or 0
    total_cost = (result or {}).get("total_cost") or 0
    return round(float(total_revenue), 2), round(float(total_revenue) - float(total_cost), 2)


def get_worker_payments_paid(company_id, start_dt=None, end_dt=None):
    """Actual money paid out to workers (amount_paid), NOT the theoretical
    full value of what they produced (units_produced * rate_per_unit).
    Pending/unpaid amounts are a liability, not an expense that's already
    reduced profit -- only money that has actually left the business should
    be deducted here.
    """
    match = {"company_id": company_id}
    if start_dt is not None or end_dt is not None:
        match["date"] = {}
        if start_dt is not None:
            match["date"]["$gte"] = start_dt
        if end_dt is not None:
            match["date"]["$lte"] = end_dt

    pipeline = [
        {"$match": match},
        {"$group": {"_id": None, "total_paid": {"$sum": "$amount_paid"}}},
    ]
    result = next(PayRecord._get_collection().aggregate(pipeline), None)
    return round(float((result or {}).get("total_paid") or 0), 2)


def get_live_financial_summary(company_id):
    """Real-time company financial summary, computed fresh on every call
    (no cached snapshot) so the dashboard always reflects the current state
    of bills, uploaded data, and worker payments.

    revenue = confirmed-bill revenue + uploaded-data revenue
    profit  = confirmed-bill profit + uploaded-data profit - actual worker payments made
    """
    bill_revenue, bill_profit = get_bill_financials(company_id)
    uploaded_revenue, uploaded_profit = get_uploaded_data_financials(company_id)
    worker_paid = get_worker_payments_paid(company_id)

    total_revenue = round(bill_revenue + uploaded_revenue, 2)
    total_profit = round(bill_profit + uploaded_profit - worker_paid, 2)

    return {
        "total_revenue": total_revenue,
        "total_profit": total_profit,
        "worker_payments": worker_paid,
        "breakdown": {
            "bills": {"revenue": bill_revenue, "profit": bill_profit},
            "uploaded_data": {"revenue": uploaded_revenue, "profit": uploaded_profit},
        },
    }


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
    worker_payments = get_worker_total_payments(month_start, now, company_id)

    # $sum can still yield None if every matched document is missing the
    # summed field, even though the aggregation returns a document -- guard
    # each field individually rather than trusting a truthy `result`.
    total_revenue = (result or {}).get("total_revenue") or 0
    total_cost = (result or {}).get("total_cost") or 0

    # Calculate gross profit (revenue - cost)
    gross_profit = Decimal(str(total_revenue)) - Decimal(str(total_cost))

    # Calculate net profit (gross profit - worker payments)
    net_profit = gross_profit - Decimal(str(worker_payments))

    # Create/update financial summary
    FinancialSummary.objects(
        company_id=company_id,
        timestamp=month_start,
    ).modify(
        upsert=True,
        new=True,
        set__total_revenue=Decimal(str(total_revenue)),
        set__total_profit=net_profit,
        set__worker_payments=Decimal(str(worker_payments)),
        set__active_workers=get_active_workers_count(company_id),
    )

def get_summary_data(company_id):  # Added company_id parameter
    """Get financial summary data without request dependency.

    Computed live from real bills (confirmed only), uploaded BusinessData,
    and actual worker payouts -- see get_live_financial_summary. This
    replaces the old FinancialSummary-snapshot approach, which only ever
    reflected uploaded spreadsheet data and never real bills.
    """
    live = get_live_financial_summary(company_id)

    # Previous-month comparison: compute the same live figures but scoped to
    # last month's window, so revenue/profit % change stays meaningful
    # without relying on the old daily/monthly snapshot table.
    #
    # NOTE: uses naive datetime.now(), not timezone.now(). Every model field
    # compared against here (Bill.profit_confirmed_at, PayRecord.date, etc.)
    # is written with naive datetime.now() throughout this codebase, and
    # MongoEngine/pymongo does not apply Django's USE_TZ handling -- mixing
    # a timezone-aware bound with naive stored values raises TypeError (or
    # produces silently wrong comparisons depending on driver version).
    now = datetime.now()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = current_month_start - timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    prev_bill_revenue, prev_bill_profit = get_bill_financials(company_id, prev_month_start, prev_month_end)
    prev_uploaded_revenue, prev_uploaded_profit = get_uploaded_data_financials(company_id, prev_month_start, prev_month_end)
    prev_worker_paid = get_worker_payments_paid(company_id, prev_month_start, prev_month_end)
    prev_revenue = round(prev_bill_revenue + prev_uploaded_revenue, 2)
    prev_profit = round(prev_bill_profit + prev_uploaded_profit - prev_worker_paid, 2)

    def calc_change(old, new):
        if old == 0 and new == 0:
            return 0.0
        if old == 0:
            return 100.0 if new > 0 else -100.0
        return float(round(((new - old) / abs(old)) * 100, 1))

    return {
        'total_revenue': live['total_revenue'],
        'total_profit': live['total_profit'],
        'worker_payments': live['worker_payments'],
        'breakdown': live['breakdown'],
        'active_workers': get_active_workers_count(company_id),
        'revenue_change': calc_change(prev_revenue, live['total_revenue']),
        'profit_change': calc_change(prev_profit, live['total_profit']),
        'workers_change': get_workers_change(company_id)
    }

def get_active_workers_count(company_id):  # Added company_id parameter
    """Count active workers from worker collection"""
    return Worker.objects(company_id=company_id, is_active=True).count()

def get_workers_change(company_id):  # Added company_id parameter
    """Calculate percentage change in active workers"""
    # Naive datetime.now() -- see note in get_summary_data above.
    now = datetime.now()
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
            return 100.0 if new > 0 else -100.0
        return float(round(((new - old) / abs(old)) * 100, 1))
    
    return calc_change(prev_count, current_count)


def get_worker_total_payments(month_start, month_end, company_id):
    """Aggregate actual worker payouts (amount_paid, not the theoretical
    full production value) for a company and date range."""
    pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "date": {
                    "$gte": month_start,
                    "$lte": month_end,
                },
            }
        },
        {
            "$group": {
                "_id": None,
                "total_payments": {"$sum": "$amount_paid"},
            }
        },
    ]

    result = next(PayRecord._get_collection().aggregate(pipeline), None)
    total = result["total_payments"] if result else 0
    return float(total or 0)
