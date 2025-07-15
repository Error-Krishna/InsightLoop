import os
import sys
import django
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator

# Set base directory and add to path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(BASE_DIR, '..'))

# Set default settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')

# Initialize Django before importing other modules
django.setup()

# Now import WebSocket routes after Django is initialized
from dashboard.routing import websocket_urlpatterns as dashboard_ws_urls
from aiexport.routing import websocket_urlpatterns as ai_assistant_ws_urls

# Combine both sets of routes
websocket_urlpatterns = dashboard_ws_urls + ai_assistant_ws_urls

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        )
    ),
})