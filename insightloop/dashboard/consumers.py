from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import get_dashboard_data
from .encoders import CustomJSONEncoder
import json
from channels.db import database_sync_to_async
from urllib.parse import parse_qs

class DashboardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Get company_id from query parameters
        query_string = parse_qs(self.scope["query_string"].decode())
        company_id = query_string.get('company_id', [None])[0]
        
        if not company_id:
            await self.close(code=4001)  # Custom close code for missing company ID
            return
        
        # Add to company-specific group
        self.group_name = f'dashboard_{company_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        
        # Send initial data
        data = await database_sync_to_async(get_dashboard_data)(company_id)
        await self.send(text_data=json.dumps(data, cls=CustomJSONEncoder))

    async def disconnect(self, close_code):
        # Remove from group
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def dashboard_update(self, event):
        # Broadcast updates to company group
        await self.send(text_data=json.dumps(event['data'], cls=CustomJSONEncoder))