from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.views import TokenRefreshView

from .api_views import LoginApiView, SignupApiView


class CsrfExemptTokenRefreshView(TokenRefreshView):
    pass


urlpatterns = [
    path("login/", csrf_exempt(LoginApiView.as_view()), name="api-login"),
    path("signup/", csrf_exempt(SignupApiView.as_view()), name="api-signup"),
    path("refresh/", csrf_exempt(CsrfExemptTokenRefreshView.as_view()), name="token-refresh"),
]
