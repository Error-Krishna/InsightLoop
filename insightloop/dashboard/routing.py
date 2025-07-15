from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/dashboard/(?P<company_id>[^/]+)/$', consumers.DashboardConsumer.as_asgi()),
]