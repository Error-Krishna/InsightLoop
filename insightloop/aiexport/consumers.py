# aiexport/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from .ai_processor import process_ai_command

class AIAssistantConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Authenticate using company ID from session
        session = self.scope.get("session")
        if not session or not session.get("company_id"):
            await self.close(code=4001)
            return
        
        self.company_id = session["company_id"]
        self.user_email = session["user_email"]
        self.group_name = f'ai_assistant_{self.company_id}'
        
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        
        # Send welcome message
        await self.send(text_data=json.dumps({
            "type": "welcome",
            "greeting": "J.A.R.V.I.S. at your service. How can I assist you today?"
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get("command")
        assistant_type = data.get("assistant", "jarvis")
        
        # Process command with AI
        response = await process_ai_command(
            self.company_id,
            self.user_email,
            command,
            assistant_type
        )
        
        # Send response to appropriate UI
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "ai_response",
                "response": response,
                "assistant": assistant_type
            }
        )

    async def ai_response(self, event):
        await self.send(text_data=json.dumps(event["response"]))