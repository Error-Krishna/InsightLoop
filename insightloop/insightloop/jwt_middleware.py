from django.http import JsonResponse
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from landing.mongo_models import User


class JWTCompanyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/v1/") and not request.path.startswith("/api/v1/auth/"):
            auth_header = request.META.get("HTTP_AUTHORIZATION", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()
                try:
                    payload = AccessToken(token)
                    email = payload.get("email")
                    if email:
                        user = User.objects.get(email=email)
                        request.company_id = str(user.company.company_id)
                        request.user_email = user.email
                        request.user_name = user.name
                        request.company_name = user.company.name
                except (TokenError, User.DoesNotExist):
                    return JsonResponse({"detail": "Invalid or expired token."}, status=401)

        return self.get_response(request)
