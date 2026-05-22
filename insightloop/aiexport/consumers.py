import json
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

logger = logging.getLogger(__name__)


class AIAssistantConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.authenticated = False
        self.company_id = None
        self.user_email = None
        self.group_name = None

        # Try JWT auth from query string. If absent, accept connection
        # but require the client to send token in the first message.
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        token_list = qs.get("token", [])
        if token_list:
            try:
                payload = AccessToken(token_list[0])
                self.company_id = payload.get("company_id")
                self.user_email = payload.get("email")
                if self.company_id and self.user_email:
                    self.group_name = f"ai_assistant_{self.company_id}"
                    await self.channel_layer.group_add(self.group_name, self.channel_name)
                    self.authenticated = True
            except TokenError as exc:
                logger.warning("JWT auth failed in connect: %s", exc)

        # Accept the socket regardless — frontend may send token in first message
        await self.accept()
        await self.send(json.dumps({
            "type": "session_status",
            "authenticated": self.authenticated,
            "message": "Connected to AI Assistant",
        }))
        logger.info("AI WS connected – user=%s company=%s auth=%s", self.user_email, self.company_id, self.authenticated)

    @database_sync_to_async
    def _authenticate(self):
        """Try JWT query-param first, then session."""
        # 1. JWT from ?token=...
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        token_list = qs.get("token", [])
        if token_list:
            try:
                payload = AccessToken(token_list[0])
                self.company_id = payload.get("company_id")
                self.user_email = payload.get("email")
                if self.company_id and self.user_email:
                    return True
            except TokenError as exc:
                logger.warning("JWT auth failed: %s", exc)

        # 2. Session fallback (Django template pages)
        session = self.scope.get("session", {})
        self.company_id = session.get("company_id")
        self.user_email = session.get("user_email")
        return bool(self.company_id and self.user_email)

    async def receive(self, text_data):
        # If not yet authenticated, expect the first message to provide token
        if not self.authenticated:
            try:
                data = json.loads(text_data)
            except json.JSONDecodeError:
                await self.send(json.dumps({"type": "error", "content": "Authentication required: send JSON with {token: <jwt>}.", "assistant": "system"}))
                return
            token = data.get("token")
            if not token:
                await self.send(json.dumps({"type": "error", "content": "Authentication required: missing token.", "assistant": "system"}))
                return
            try:
                payload = AccessToken(token)
                self.company_id = payload.get("company_id")
                self.user_email = payload.get("email")
                if not (self.company_id and self.user_email):
                    await self.send(json.dumps({"type": "error", "content": "Invalid token payload.", "assistant": "system"}))
                    return
                self.group_name = f"ai_assistant_{self.company_id}"
                await self.channel_layer.group_add(self.group_name, self.channel_name)
                self.authenticated = True
                await self.send(json.dumps({"type": "session_status", "authenticated": True}))
            except TokenError as exc:
                logger.warning("JWT auth failed in receive: %s", exc)
                await self.send(json.dumps({"type": "error", "content": "Invalid or expired token.", "assistant": "system"}))
                await self.close(code=4001)
                return
        try:
            data = json.loads(text_data)
            # Normal command handling
            command = data.get("command", "").strip()
            assistant_type = data.get("assistant", "jarvis")
            if not command:
                await self.send(json.dumps({"type": "error", "content": "Missing command", "assistant": assistant_type}))
                return

            response_data = await self._process_command(self.company_id, self.user_email, command, assistant_type)
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "ai_response", "response": response_data, "assistant": assistant_type},
            )
        except json.JSONDecodeError:
            await self.send(json.dumps({"type": "error", "content": "Invalid JSON", "assistant": "system"}))
        except Exception as exc:
            logger.exception("Error processing WS message: %s", exc)
            await self.send(json.dumps({"type": "error", "content": f"Internal error: {exc}", "assistant": "system"}))

    async def ai_response(self, event):
        try:
            await self.send(text_data=json.dumps(event["response"]))
        except Exception as exc:
            logger.error("Error sending AI response: %s", exc)

    async def disconnect(self, close_code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("AI WS disconnected – code=%s", close_code)

    @database_sync_to_async
    def _process_command(self, company_id, user_email, command, assistant_type):
        from .ai_processor import process_ai_command
        return process_ai_command(company_id, user_email, command, assistant_type)