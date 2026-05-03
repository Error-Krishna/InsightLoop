from django.urls import path

from .api_views import ProfileApiView


urlpatterns = [
    path("", ProfileApiView.as_view(), name="api-profile"),
]
