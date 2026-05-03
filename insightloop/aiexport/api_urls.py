from django.urls import path

from .api_views import AICommandApiView, AIConfigApiView


urlpatterns = [
    path("config/", AIConfigApiView.as_view(), name="api-ai-config"),
    path("command/", AICommandApiView.as_view(), name="api-ai-command"),
]
