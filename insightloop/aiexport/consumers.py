import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.sessions.models import Session
from .ai_processor import process_ai_command

logger = logging.getLogger(__name__)

class AIAssistantConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Initialize attributes
        self.authenticated = False
        self.company_id = None
        self.user_email = None
        self.group_name = None
        
        # Accept the connection to allow communication
        await self.accept()
        logger.info("WebSocket connection accepted, awaiting authentication")

    @database_sync_to_async
    def get_session_data(self, session_key):
        """Fetch session data from the database"""
        try:
            session = Session.objects.get(session_key=session_key)
            return session.get_decoded()
        except Session.DoesNotExist:
            logger.warning(f"Session not found: {session_key}")
            return None
        except Exception as e:
            logger.error(f"Error fetching session: {str(e)}")
            return None

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            logger.debug(f"Received WebSocket message: {data}")
            
            # Handle session authentication
            if data.get("type") == "session":
                session_key = data.get("session")
                if not session_key:
                    await self.send(json.dumps({
                        "type": "session_status",
                        "authenticated": False,
                        "message": "Missing session token"
                    }))
                    await self.close(code=4001)
                    return
                
                session_data = await self.get_session_data(session_key)
                if not session_data:
                    await self.send(json.dumps({
                        "type": "session_status",
                        "authenticated": False,
                        "message": "Invalid session"
                    }))
                    await self.close(code=4001)
                    return
                
                self.company_id = session_data.get("company_id")
                self.user_email = session_data.get("user_email")
                
                if not self.company_id or not self.user_email:
                    await self.send(json.dumps({
                        "type": "session_status",
                        "authenticated": False,
                        "message": "Missing company or user data"
                    }))
                    await self.close(code=4001)
                    return
                
                # Create group name and add to channel group
                self.group_name = f'ai_assistant_{self.company_id}'
                await self.channel_layer.group_add(
                    self.group_name,
                    self.channel_name
                )
                
                self.authenticated = True
                await self.send(json.dumps({
                    "type": "session_status",
                    "authenticated": True,
                    "message": "Authenticated successfully"
                }))
                logger.info(f"Authenticated user {self.user_email} from company {self.company_id}")
                return
            
            # Process commands only if authenticated
            if not self.authenticated:
                await self.send(json.dumps({
                    "type": "error",
                    "content": "Not authenticated",
                    "assistant": "system"
                }))
                await self.close(code=4003)
                return
                
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