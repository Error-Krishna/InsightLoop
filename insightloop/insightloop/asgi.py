# insightloop/asgi.py
import os
import sys

# Add this to ensure the project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

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