from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import get_dashboard_data
from .encoders import CustomJSONEncoder
import json
from django.contrib.auth.models import AnonymousUser
from channels.db import database_sync_to_async

class DashboardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Get company_id from session
        session = self.scope.get("session")
        if not session or 'company_id' not in session:
            await self.close(code=4001)
            return
            
        company_id = session.get("company_id")
        if not company_id:
            await self.close(code=4001)
            return
        
        # Add to company-specific group
        self.group_name = f'dashboard_{company_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        
        # Send initial data
        data = await database_sync_to_async(get_dashboard_data)(company_id)
        await self.send(json.dumps(data, cls=CustomJSONEncoder))

    async def disconnect(self, close_code):
        # Remove from group
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def dashboard_update(self, event):
        # Broadcast updates to company group
        await self.send(json.dumps(event['data'], cls=CustomJSONEncoder))