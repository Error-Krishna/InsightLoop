from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import get_dashboard_data
from .encoders import CustomJSONEncoder
import json
from channels.db import database_sync_to_async
from urllib.parse import parse_qs
import logging

logger = logging.getLogger(__name__)

class DashboardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            # Get company_id from query parameters
            query_string = parse_qs(self.scope["query_string"].decode())
            company_id = query_string.get('company_id', [None])[0]
            
            if not company_id:
                logger.warning("WebSocket connection rejected: Missing company_id")
                await self.close(code=4001)
                return
            
            # Add to company-specific group
            self.group_name = f'dashboard_{company_id}'
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            await self.accept()
            
            # Send initial data
            data = await database_sync_to_async(get_dashboard_data)(company_id)
            await self.send(text_data=json.dumps(data, cls=CustomJSONEncoder))
            logger.info(f"WebSocket connected for company: {company_id}")
            
        except Exception as e:
            logger.error(f"WebSocket connection error: {str(e)}")
            await self.close(code=4002)

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            logger.info(f"WebSocket disconnected: {self.group_name}")

    async def dashboard_update(self, event):
        try:
            await self.send(text_data=json.dumps(event['data'], cls=CustomJSONEncoder))
        except Exception as e:
            logger.error(f"WebSocket send error: {str(e)}")