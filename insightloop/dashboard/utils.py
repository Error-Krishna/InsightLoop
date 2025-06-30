from .queries import get_rev_exp_data, get_profit_trends
from .data_service import get_summary_data
from .encoders import CustomJSONEncoder
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json

def get_dashboard_data():
    data = {
        'summary': get_summary_data(),
        'revExp': get_rev_exp_data(),
        'profitTrends': get_profit_trends(months=6, interval='monthly')
    }
    return json.loads(json.dumps(data, cls=CustomJSONEncoder))

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