import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)

class AIAssistantConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Initialize attributes
        self.authenticated = False
        self.company_id = None
        self.user_email = None
        self.group_name = None
        
        # Get session from scope
        session = self.scope.get("session")
        if not session:
            logger.warning("No session found in WebSocket scope")
            await self.close(code=4001)
            return
            
        # Get session data
        self.company_id = session.get("company_id")
        self.user_email = session.get("user_email")
        
        if not self.company_id or not self.user_email:
            logger.warning("Missing company_id or user_email in session")
            await self.close(code=4001)
            return
            
        # Create group name
        self.group_name = f'ai_assistant_{self.company_id}'
        
        # Add to channel group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        
        self.authenticated = True
        await self.accept()
        
        # Send authentication success
        await self.send(json.dumps({
            "type": "session_status",
            "authenticated": True,
            "message": "Authenticated successfully"
        }))
        logger.info(f"Authenticated user {self.user_email} from company {self.company_id}")

    async def receive(self, text_data):
        try:
            if not self.authenticated:
                logger.warning("Received message before authentication")
                await self.send(json.dumps({
                    "type": "error",
                    "content": "Not authenticated",
                    "assistant": "system"
                }))
                return
                
            data = json.loads(text_data)
            logger.debug(f"Received WebSocket message: {data}")
            
            command = data.get("command")
            assistant_type = data.get("assistant", "jarvis")
            
            if not command:
                await self.send(json.dumps({
                    "type": "error",
                    "content": "Missing command",
                    "assistant": assistant_type
                }))
                return
                
            # Process command with AI
            logger.info(f"Processing command for {assistant_type}: {command}")
            response = await self.process_ai_command(
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
            
        except json.JSONDecodeError:
            await self.send(json.dumps({
                "type": "error",
                "content": "Invalid message format",
                "assistant": "system"
            }))
        except Exception as e:
            logger.error(f"Error processing message: {str(e)}", exc_info=True)
            await self.send(json.dumps({
                "type": "error",
                "content": f"Internal error: {str(e)}",
                "assistant": "system"
            }))

    async def ai_response(self, event):
        """Send AI response to client"""
        try:
            await self.send(text_data=json.dumps(event["response"]))
            logger.debug("Sent AI response to client")
        except Exception as e:
            logger.error(f"Error sending response: {str(e)}")

    async def disconnect(self, close_code):
        """Clean up on disconnect"""
        try:
            if self.group_name:
                await self.channel_layer.group_discard(
                    self.group_name, 
                    self.channel_name
                )
                logger.info(f"Disconnected from group {self.group_name}")
        except Exception as e:
            logger.error(f"Error during disconnect: {str(e)}")
        finally:
            logger.info(f"WebSocket disconnected with code {close_code}")
    
    @database_sync_to_async
    def process_ai_command(self, company_id, user_email, command, assistant_type):
        """Wrapper for synchronous AI processing"""
        # Import inside the function to avoid circular imports
        from .ai_processor import process_ai_command
        return process_ai_command(company_id, user_email, command, assistant_type)