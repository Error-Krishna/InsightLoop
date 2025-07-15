import json
from datetime import datetime
from django.core.files.storage import default_storage
from django.urls import reverse
from dashboard.utils import generate_export_file
from insights.utils import get_insight_data

def process_ai_command(company_id, user_email, command, assistant_type):
    command = command.lower()
    response = {
        "assistant": assistant_type,
        "timestamp": datetime.now().isoformat()
    }
    
    try:
        # Enhanced export commands with additional options
        if "export" in command:
            export_type = None
            
            if any(kw in command for kw in ["business", "sales", "revenue"]):
                export_type = "business_trends"
            elif any(kw in command for kw in ["worker", "labor", "staff"]):
                export_type = "worker_management"
            elif any(kw in command for kw in ["salary", "payment", "payroll"]):
                export_type = "salary_payments"
            elif any(kw in command for kw in ["complete", "all", "full"]):
                export_type = "complete_analytics"
            
            if export_type:
                file_url = generate_export_file(company_id, export_type)
                response.update({
                    "action": "download",
                    "file_url": file_url,
                    "message": f"Your {export_type.replace('_', ' ')} export is ready!"
                })
            else:
                response.update({
                    "action": "message",
                    "content": "Please specify what to export: business trends, worker management, salary payments, or complete analytics"
                })
        
        # Enhanced navigation commands
        elif any(kw in command for kw in ["dashboard", "home", "overview"]):
            response.update({
                "action": "navigate",
                "url": reverse("dashboard")
            })
        elif any(kw in command for kw in ["insight", "analysis", "findings"]):
            response.update({
                "action": "navigate",
                "url": reverse("insights")
            })
        elif any(kw in command for kw in ["upload", "import", "data"]):
            response.update({
                "action": "navigate",
                "url": reverse("upload")
            })
        
        # Data query commands
        elif any(kw in command for kw in ["show", "display", "what is", "how much"]):
            if any(kw in command for kw in ["revenue", "income", "sales"]):
                data = get_insight_data(company_id, "revenue_trends")
                response.update({
                    "action": "display",
                    "content": json.dumps({
                        "type": "revenue_trends",
                        "data": data
                    })
                })
            elif any(kw in command for kw in ["profit", "earnings", "margin"]):
                data = get_insight_data(company_id, "profit_analysis")
                response.update({
                    "action": "display",
                    "content": json.dumps({
                        "type": "profit_analysis",
                        "data": data
                    })
                })
            elif any(kw in command for kw in ["worker", "staff", "labor", "productivity"]):
                data = get_insight_data(company_id, "worker_performance")
                response.update({
                    "action": "display",
                    "content": json.dumps({
                        "type": "worker_performance",
                        "data": data
                    })
                })
            else:
                response.update({
                    "action": "message",
                    "content": "I can show you revenue trends, profit analysis, or worker performance"
                })
        
        # Default response for unrecognized commands
        else:
            response.update({
                "action": "message",
                "content": "I can help with exports, navigation, or data analysis. Try: 'Export business trends' or 'Show me worker productivity'"
            })
    
    except Exception as e:
        response.update({
            "action": "error",
            "content": f"Error processing your request: {str(e)}"
        })
    
    return response