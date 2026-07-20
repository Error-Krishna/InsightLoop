from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import get_dashboard_data
from .encoders import CustomJSONEncoder
import json
from channels.db import database_sync_to_async
import logging
from urllib.parse import parse_qs
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError

from landing.mongo_models import User

logger = logging.getLogger(__name__)


def _lookup_company_id(email):
    """Resolve company_id from the live user record, not the JWT claim.

    Trusting a company_id claim baked into the token would let a stale or
    forged token join another company's dashboard group. The email claim is
    only used to look up the current user; the company_id actually used for
    scoping always comes from that user's live database record.
    """
    if not email:
        return None
    try:
        mongo_user = User.objects.get(email=email)
    except User.DoesNotExist:
        return None
    return str(mongo_user.company.company_id)


class DashboardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            # Prefer JWT from query string: ?token=<jwt>
            qs = parse_qs(self.scope.get("query_string", b"").decode())
            token_list = qs.get("token", [])
            if not token_list:
                await self.close(code=4001)
                return

            try:
                payload = AccessToken(token_list[0])
            except TokenError as exc:
                logger.error("Invalid JWT token: %s", exc)
                await self.close(code=4001)
                return

            email = payload.get("email")
            self.company_id = await database_sync_to_async(_lookup_company_id)(email)
            if not self.company_id:
                logger.error("WebSocket auth failed: no user found for token email")
                await self.close(code=4001)
                return

            self.group_name = f'dashboard_{self.company_id}'
            await self.channel_layer.group_add(self.group_name, self.channel_name)
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