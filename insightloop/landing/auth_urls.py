from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.views import TokenRefreshView

from .api_views import GoogleLoginApiView, LoginApiView, SignupApiView


class CsrfExemptTokenRefreshView(TokenRefreshView):
    authentication_classes = []


urlpatterns = [
    path("login/", csrf_exempt(LoginApiView.as_view()), name="api-login"),
    path("signup/", csrf_exempt(SignupApiView.as_view()), name="api-signup"),
    path("google/", csrf_exempt(GoogleLoginApiView.as_view()), name="api-google-login"),
    path("refresh/", csrf_exempt(CsrfExemptTokenRefreshView.as_view()), name="token-refresh"),
]
