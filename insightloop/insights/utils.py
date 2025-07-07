from datetime import datetime, timedelta
from dashboard.models import FinancialSummary
from upload.models import BusinessData
from worker.models import MaterialAssignment, PayRecord, Worker

async def get_insight_data(company_id, insight_type):
    # Calculate date ranges
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    if insight_type == "revenue_trends":
        # Aggregate daily revenue
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "date": {"$gte": start_date, "$lte": end_date}
            }},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$date"}},
                "total_revenue": {"$sum": {"$multiply": ["$quantity", "$selling_price"]}}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = list(BusinessData.objects.aggregate(*pipeline))
        
        # Format results
        return [{
            "date": result["_id"],
            "revenue": result["total_revenue"]
        } for result in results]
    
    elif insight_type == "profit_analysis":
        # Aggregate daily profit
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "date": {"$gte": start_date, "$lte": end_date}
            }},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$date"}},
                "total_profit": {"$sum": {
                    "$subtract": [
                        {"$multiply": ["$quantity", "$selling_price"]},
                        {"$multiply": ["$quantity", "$production_cost"]}
                    ]
                }}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = list(BusinessData.objects.aggregate(*pipeline))
        
        return [{
            "date": result["_id"],
            "profit": result["total_profit"]
        } for result in results]
    
    elif insight_type == "worker_performance":
        # Get worker productivity metrics
        workers = Worker.objects(company_id=company_id, is_active=True)
        performance_data = []
        
        for worker in workers:
            # Calculate productivity metrics
            payments = PayRecord.objects(company_id=company_id, worker=worker)
            total_units = sum(p.units_produced for p in payments)
            avg_pay_rate = (sum(p.rate_per_unit for p in payments) / len(payments)) if payments else 0
            
            # Get material efficiency
            materials = MaterialAssignment.objects(company_id=company_id, worker=worker)
            material_cost = sum(m.quantity * m.price_per_unit for m in materials)
            revenue_generated = sum(p.units_produced * p.rate_per_unit for p in payments)
            
            efficiency = (revenue_generated / material_cost * 100) if material_cost > 0 else 0
            
            performance_data.append({
                "name": worker.name,
                "total_units": total_units,
                "avg_pay_rate": avg_pay_rate,
                "efficiency": round(efficiency, 2)
            })
        
        return performance_data
    
    return []