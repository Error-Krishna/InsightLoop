import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.sessions.models import Session

logger = logging.getLogger(__name__)

class AIAssistantConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        self.authenticated = False
        self.company_id = None
        self.user_email = None
        self.group_name = None  # Initialize group_name to None

    @database_sync_to_async
    def get_session_data(self, session_key):
        try:
            session = Session.objects.get(session_key=session_key)
            return session.get_decoded()
        except Session.DoesNotExist:
            return None

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            
            # Handle session authentication
            if data.get("type") == "session":
                session_key = data.get("session")
                session_data = await self.get_session_data(session_key)
                
                if session_data:
                    self.company_id = session_data.get("company_id")
                    self.user_email = session_data.get("user_email")
                    
                    if self.company_id and self.user_email:
                        self.authenticated = True
                        self.group_name = f'ai_assistant_{self.company_id}'
                        await self.channel_layer.group_add(
                            self.group_name,
                            self.channel_name
                        )
                        await self.send(json.dumps({
                            "type": "session_status",
                            "authenticated": True
                        }))
                        return
                
                await self.send(json.dumps({
                    "type": "session_status",
                    "authenticated": False
                }))
                await self.close(code=4001)
                return
            
            # Process commands only if authenticated
            if not self.authenticated:
                await self.send(json.dumps({
                    "type": "error",
                    "content": "Not authenticated"
                }))
                await self.close(code=4003)
                return
                
            # ... rest of your command processing ...
            
        except json.JSONDecodeError:
            await self.send(json.dumps({
                "type": "error",
                "content": "Invalid message format"
            }))
    
    async def disconnect(self, close_code):
        # Only remove from group if group_name is set
        if self.group_name:
            await self.channel_layer.group_discard(
                self.group_name, 
                self.channel_name
            )