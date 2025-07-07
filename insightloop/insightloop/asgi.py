# insightloop/asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django_asgi_app = get_asgi_application()

# Import WebSocket routes
import dashboard.routing
import aiexport.routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            dashboard.routing.websocket_urlpatterns +
            aiexport.routing.websocket_urlpatterns
        )
    ),
})