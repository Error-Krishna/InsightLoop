import os
import sys
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(BASE_DIR, '..'))

from dashboard.routing import websocket_urlpatterns as dashboard_ws_urls
from aiexport.routing import websocket_urlpatterns as ai_assistant_ws_urls

websocket_urlpatterns = dashboard_ws_urls + ai_assistant_ws_urls


os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(  # Correctly wrapped now
            URLRouter(websocket_urlpatterns)
        )
    ),
})

