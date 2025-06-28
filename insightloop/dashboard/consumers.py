# dashboard/consumers.py
from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import get_dashboard_data
from .encoders import CustomJSONEncoder  # Add this
import json

class DashboardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("dashboard", self.channel_name)
        await self.accept()
        
        # Send initial data on connect
        data = get_dashboard_data()
        await self.send(json.dumps(data, cls=CustomJSONEncoder))  # Use custom encoder

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("dashboard", self.channel_name)

    async def dashboard_update(self, event):
        # Broadcast updates to all clients
        await self.send(json.dumps(event['data'], cls=CustomJSONEncoder))  # Use custom encoder