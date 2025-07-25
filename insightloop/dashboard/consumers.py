from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import get_dashboard_data
from .encoders import CustomJSONEncoder
import json
from channels.db import database_sync_to_async
import logging
import uuid

logger = logging.getLogger(__name__)

class DashboardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            # Get company_id from URL parameters
            self.company_id = self.scope['url_route']['kwargs']['company_id']
            
            # Validate company_id format
            try:
                uuid.UUID(self.company_id)  # Validate as UUID
            except ValueError:
                logger.error(f"Invalid company_id format: {self.company_id}")
                await self.close(code=4001)
                return
                
            self.group_name = f'dashboard_{self.company_id}'
            
            # Add to channel group
            await self.channel_layer.group_add(
                self.group_name,
                self.channel_name
            )
            await self.accept()
            
            # Fetch and send initial data
            data = await database_sync_to_async(get_dashboard_data)(self.company_id)
            await self.send(text_data=json.dumps(data, cls=CustomJSONEncoder))
            
        except Exception as e:
            logger.error(f"Connection error: {str(e)}", exc_info=True)
            await self.close(code=4002)

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            logger.info(f"WebSocket disconnected: {self.group_name} (code: {close_code})")

    async def dashboard_update(self, event):
        try:
            await self.send(text_data=json.dumps(event['data'], cls=CustomJSONEncoder))
        except Exception as e:
            logger.error(f"WebSocket send error: {str(e)}", exc_info=True)