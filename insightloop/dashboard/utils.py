from datetime import datetime
from .queries import get_rev_exp_data, get_profit_trends
from .data_service import get_summary_data
from .encoders import CustomJSONEncoder
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from bson import ObjectId  # Add this import
import json
from mongoengine.errors import DoesNotExist

from worker.models import Worker, PayRecord  # Add these imports

def get_dashboard_data():
    data = {
        'summary': get_summary_data(),
        'revExp': get_rev_exp_data(),
        'profitTrends': get_profit_trends(months=6, interval='monthly'),
        'workers': get_worker_payments(),
        'topWorkers': get_top_workers()
    }
    
    # Convert MongoDB documents to serializable format
    def convert_types(obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, list):
            return [convert_types(item) for item in obj]
        if isinstance(obj, dict):
            return {k: convert_types(v) for k, v in obj.items()}
        return obj
    
    converted_data = convert_types(data)
    return json.loads(json.dumps(converted_data, cls=CustomJSONEncoder))

# Add these new functions
def get_worker_payments():
    """Get recent worker payments"""
    records = PayRecord.objects.order_by('-date')[:10]
    results = []
    
    for record in records:
        try:
            # Attempt to access worker name (triggers dereference)
            worker_name = record.worker.name
        except DoesNotExist:
            worker_name = "Deleted Worker"
            
        results.append({
            'name': worker_name,
            'month': record.date.strftime('%B %Y'),
            'amount': float(record.units_produced * record.rate_per_unit),
            'status': 'Paid' if record.paid else 'Pending'
        })
        
    return results

def broadcast_update():
    data = get_dashboard_data()
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        "dashboard",
        {
            'type': 'dashboard.update',
            'data': data
        }
    )

def get_top_workers():
    """Get top workers by total payout"""
    pipeline = [
        {"$group": {
            "_id": "$worker",
            "total_payout": {"$sum": {"$multiply": ["$units_produced", "$rate_per_unit"]}},
            "payment_count": {"$sum": 1},
            "latest_payment": {"$max": "$date"}
        }},
        {"$sort": {"total_payout": -1}},
        {"$limit": 5},
        {"$lookup": {
            "from": "workers",
            "localField": "_id",
            "foreignField": "_id",
            "as": "worker_info"
        }},
        {"$unwind": "$worker_info"},
        {"$project": {
            "name": "$worker_info.name",
            "total_payout": 1,
            "payment_count": 1,
            "latest_payment": 1
        }}
    ]
    
    results = PayRecord._get_collection().aggregate(pipeline)
    top_workers = []
    
    for worker in results:
        # Convert MongoDB types to Python native types
        worker_data = {
            'name': worker.get('name', 'Unknown'),
            'total_payout': float(worker.get('total_payout', 0)),
            'payment_count': worker.get('payment_count', 0),
        }
        
        # Handle latest_payment
        latest_payment = worker.get('latest_payment')
        if isinstance(latest_payment, datetime):
            worker_data['latest_payment'] = latest_payment.isoformat()
        else:
            worker_data['latest_payment'] = str(latest_payment) if latest_payment else 'N/A'
        
        top_workers.append(worker_data)
    
    return top_workers

def get_worker_total_payments():
    """Get total payments per worker"""
    pipeline = [
        {
            "$group": {
                "_id": "$worker",
                "total_amount": {
                    "$sum": {"$multiply": ["$units_produced", "$rate_per_unit"]}
                }
            }
        },
        {
            "$lookup": {
                "from": "workers",
                "localField": "_id",
                "foreignField": "_id",
                "as": "worker_info"
            }
        },
        {"$unwind": "$worker_info"},
        {"$project": {
            "name": "$worker_info.name",
            "amount": "$total_amount"
        }}
    ]
    
    results = PayRecord._get_collection().aggregate(pipeline)
    return list(results)