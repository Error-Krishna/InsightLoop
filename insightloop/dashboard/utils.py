import csv
import io
import json
from datetime import datetime

from asgiref.sync import async_to_sync
from bson import ObjectId
from channels.layers import get_channel_layer
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from mongoengine.errors import DoesNotExist

from dashboard.models import FinancialSummary
from insights.models import Insight
from upload.models import BusinessData
from worker.models import MaterialAssignment, PayRecord, Worker
from bills.models import Bill

from .data_service import get_summary_data
from .encoders import CustomJSONEncoder
from .queries import get_profit_trends, get_rev_exp_data


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def safe_date_format(date_obj, default=""):
    if date_obj is None:
        return default
    try:
        return date_obj.isoformat()
    except Exception:
        return str(date_obj) if date_obj else default


def safe_getattr(obj, attr, default=""):
    value = getattr(obj, attr, None)
    return value if value is not None else default


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard data aggregation
# ──────────────────────────────────────────────────────────────────────────────

def get_dashboard_data(company_id):
    data = {
        "summary": get_summary_data(company_id),
        "revExp": get_rev_exp_data(company_id),
        "profitTrends": get_profit_trends(company_id, months=6, interval="monthly"),
        "workers": get_worker_payments(company_id),
        "topWorkers": get_top_workers(company_id),
        "billsCount": Bill.objects(company_id=company_id).count(),
    }

    def convert_types(obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, list):
            return [convert_types(item) for item in obj]
        if isinstance(obj, dict):
            return {k: convert_types(v) for k, v in obj.items()}
        return obj

    converted = convert_types(data)
    return json.loads(json.dumps(converted, cls=CustomJSONEncoder))


def get_worker_payments(company_id):
    records = PayRecord.objects(company_id=company_id).order_by("-date")[:10]
    results = []
    for record in records:
        try:
            worker_name = record.worker.name
        except DoesNotExist:
            worker_name = "Deleted Worker"
        results.append({
            "name": worker_name,
            "month": record.date.strftime("%B %Y"),
            "amount": float(record.units_produced * record.rate_per_unit),
            "status": "Paid" if record.paid else "Pending",
        })
    return results


def get_top_workers(company_id):
    pipeline = [
        {"$match": {"company_id": company_id}},
        {"$group": {
            "_id": "$worker",
            "total_payout": {"$sum": {"$multiply": ["$units_produced", "$rate_per_unit"]}},
            "payment_count": {"$sum": 1},
            "latest_payment": {"$max": "$date"},
        }},
        {"$sort": {"total_payout": -1}},
        {"$limit": 5},
        {"$lookup": {"from": "workers", "localField": "_id", "foreignField": "_id", "as": "worker_info"}},
        {"$unwind": "$worker_info"},
        {"$project": {"name": "$worker_info.name", "total_payout": 1, "payment_count": 1, "latest_payment": 1}},
    ]
    results = list(PayRecord._get_collection().aggregate(pipeline))
    top_workers = []
    for worker in results:
        latest = worker.get("latest_payment")
        top_workers.append({
            "name": worker.get("name", "Unknown"),
            "total_payout": float(worker.get("total_payout", 0)),
            "payment_count": worker.get("payment_count", 0),
            "latest_payment": latest.isoformat() if isinstance(latest, datetime) else str(latest or "N/A"),
        })
    return top_workers


def get_worker_total_payments(company_id):
    pipeline = [
        {"$match": {"company_id": company_id}},
        {"$group": {
            "_id": "$worker",
            "total_amount": {"$sum": {"$multiply": ["$units_produced", "$rate_per_unit"]}},
        }},
        {"$lookup": {"from": "workers", "localField": "_id", "foreignField": "_id", "as": "worker_info"}},
        {"$unwind": "$worker_info"},
        {"$project": {"name": "$worker_info.name", "amount": "$total_amount"}},
    ]
    return list(PayRecord._get_collection().aggregate(pipeline))


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket broadcast helpers
# ──────────────────────────────────────────────────────────────────────────────

def broadcast_update(company_id):
    data = get_dashboard_data(company_id)
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"dashboard_{company_id}",
        {"type": "dashboard.update", "data": data},
    )


# ──────────────────────────────────────────────────────────────────────────────
# CSV export
# ──────────────────────────────────────────────────────────────────────────────

def generate_export_file(company_id, report_type):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"exports/{company_id}/{report_type}_{timestamp}.csv"
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    if report_type == "business_trends":
        business_data = BusinessData.objects(company_id=company_id).order_by("date")
        writer.writerow(["Date", "Product", "Category", "Quantity Sold", "Production Cost", "Selling Price", "Revenue", "Profit"])
        for data in business_data:
            date_str = safe_date_format(data.date)
            revenue = data.quantity * safe_getattr(data, "selling_price", 0)
            cost = data.quantity * safe_getattr(data, "production_cost", 0)
            writer.writerow([
                date_str, safe_getattr(data, "product", ""), safe_getattr(data, "category", ""),
                safe_getattr(data, "quantity", 0), safe_getattr(data, "production_cost", 0),
                safe_getattr(data, "selling_price", 0), revenue, revenue - cost,
            ])

    elif report_type == "worker_management":
        workers = Worker.objects(company_id=company_id)
        writer.writerow(["Worker Name", "Contact", "Status", "Total Materials Assigned", "Total Value", "Total Units Produced", "Total Pay Due"])
        for worker in workers:
            materials = MaterialAssignment.objects(company_id=company_id, worker=worker)
            pay_records = PayRecord.objects(company_id=company_id, worker=worker)
            total_materials = sum(safe_getattr(m, "quantity", 0) for m in materials)
            total_value = sum(safe_getattr(m, "quantity", 0) * safe_getattr(m, "price_per_unit", 0) for m in materials)
            total_units = sum(safe_getattr(p, "units_produced", 0) for p in pay_records)
            total_pay = sum(safe_getattr(p, "units_produced", 0) * safe_getattr(p, "rate_per_unit", 0) for p in pay_records)
            writer.writerow([
                safe_getattr(worker, "name", "Unknown"), safe_getattr(worker, "phone", ""),
                "Active" if safe_getattr(worker, "is_active", False) else "Inactive",
                total_materials, total_value, total_units, total_pay,
            ])

    elif report_type == "salary_payments":
        payments = PayRecord.objects(company_id=company_id).order_by("-date")
        writer.writerow(["Date", "Worker", "Product", "Units Produced", "Rate per Unit", "Amount Due", "Payment Status"])
        for payment in payments:
            worker_name = safe_getattr(payment.worker, "name", "Unknown") if payment.worker else "Unknown"
            writer.writerow([
                safe_date_format(payment.date), worker_name,
                safe_getattr(payment, "product_name", ""),
                safe_getattr(payment, "units_produced", 0),
                safe_getattr(payment, "rate_per_unit", 0),
                safe_getattr(payment, "units_produced", 0) * safe_getattr(payment, "rate_per_unit", 0),
                "Paid" if safe_getattr(payment, "paid", False) else "Pending",
            ])

    elif report_type == "complete_analytics":
        financials = FinancialSummary.objects(company_id=company_id).order_by("-timestamp")
        writer.writerow(["Financial Summary"])
        writer.writerow(["Timestamp", "Total Revenue", "Total Profit", "Worker Payments", "Active Workers"])
        for fin in financials:
            writer.writerow([
                safe_date_format(fin.timestamp), safe_getattr(fin, "total_revenue", 0),
                safe_getattr(fin, "total_profit", 0), safe_getattr(fin, "worker_payments", 0),
                safe_getattr(fin, "active_workers", 0),
            ])
        insights = Insight.objects(company_id=company_id).order_by("-created_at")
        writer.writerow([])
        writer.writerow(["Business Insights"])
        writer.writerow(["Title", "Description", "Created At"])
        for insight in insights:
            desc = safe_getattr(insight, "description", "")
            writer.writerow([
                safe_getattr(insight, "title", ""),
                desc[:100] + "..." if len(desc) > 100 else desc,
                safe_date_format(insight.created_at),
            ])

    content = buffer.getvalue()
    buffer.close()
    default_storage.save(filename, ContentFile(content.encode("utf-8")))
    return default_storage.url(filename)