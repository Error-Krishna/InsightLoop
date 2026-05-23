from django.urls import path

from .api_views import ProfileApiView, WorkspaceSettingsApiView


urlpatterns = [
    path("", ProfileApiView.as_view(), name="api-profile"),
    path("settings/", WorkspaceSettingsApiView.as_view(), name="api-workspace-settings"),
]
