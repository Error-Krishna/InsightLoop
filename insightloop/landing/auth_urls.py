from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .api_views import LoginApiView, SignupApiView


urlpatterns = [
    path("login/", LoginApiView.as_view(), name="api-login"),
    path("signup/", SignupApiView.as_view(), name="api-signup"),
    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
]
