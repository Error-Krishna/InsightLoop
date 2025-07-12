import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()

# Import WebSocket routes AFTER django.setup()
from dashboard.routing import websocket_urlpatterns as dashboard_ws
from aiexport.routing import websocket_urlpatterns as aiexport_ws

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(
                dashboard_ws + aiexport_ws
            )
        )
    ),
})