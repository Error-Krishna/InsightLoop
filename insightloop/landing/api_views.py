import logging
import secrets

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from insightloop.api_utils import serialize_value

from .auth_backends import MongoAuthBackend
from .authentication import issue_tokens_for_user
from .mongo_models import Company, User

logger = logging.getLogger(__name__)


def _auth_response(user):
    return {
        "tokens": issue_tokens_for_user(user),
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "company_id": str(user.company.company_id),
            "company_name": user.company.name,
        },
    }


@method_decorator(csrf_exempt, name="dispatch")
class SignupApiView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        name = (request.data.get("name") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        company_name = (request.data.get("company") or request.data.get("company_name") or "").strip()

        if not all([name, email, password, company_name]):
            return Response({"detail": "Name, email, company, and password are required."}, status=400)

        if User.objects(email=email).first():
            return Response({"detail": "Email already registered."}, status=400)

        company = Company(name=company_name, email=email)
        company.save()

        user = User(
            name=name,
            email=email,
            company=company,
            username=email.split("@")[0],
            last_login=timezone.now(),
        )
        user.set_password(password)
        user.save()

        return Response(_auth_response(user), status=201)


@method_decorator(csrf_exempt, name="dispatch")
class LoginApiView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        logger.debug("LoginApiView.post reached for path %s", request.path)
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""

        if not email or not password:
            return Response({"detail": "Email and password are required."}, status=400)

        backend = MongoAuthBackend()
        user = backend.authenticate(request, email=email, password=password)
        if user is None:
            return Response({"detail": "Invalid email or password."}, status=401)

        user.last_login = timezone.now()
        user.save()
        return Response(_auth_response(user))


@method_decorator(csrf_exempt, name="dispatch")
class GoogleLoginApiView(APIView):
    """JSON-API Google sign-in for the React app.

    This is the JWT-based counterpart to the legacy landing/views.py
    google_auth/google_callback views, which log into a Django SESSION and
    redirect to a Django-rendered URL -- neither of which the React SPA (on
    Vercel, calling the API on Render) can use. This view instead accepts a
    Google ID token obtained client-side (e.g. via Google Identity
    Services' JS SDK), verifies it directly with Google, and returns the
    same {tokens, user} JSON shape as the regular email/password login, so
    the frontend's existing setSession() handles it identically either way.

    If the email doesn't match an existing user, a new company + user is
    created automatically (company name defaults to the person's name --
    they can rename it later in Profile settings) rather than redirecting
    to a separate "choose your company name" step, since that intermediate
    page was part of the old session-based flow and doesn't have a React
    equivalent yet.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        id_token = request.data.get("credential") or request.data.get("id_token")
        if not id_token:
            return Response({"detail": "Missing Google credential."}, status=400)

        try:
            response = requests.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_token},
                timeout=10,
            )
        except requests.RequestException as exc:
            logger.error("Google tokeninfo request failed: %s", exc)
            return Response({"detail": "Could not verify Google credential."}, status=502)

        if not response.ok:
            return Response({"detail": "Invalid or expired Google credential."}, status=401)

        payload = response.json()

        # tokeninfo verifies the token's signature/expiry, but NOT which
        # app it was issued for -- that's on us to check, otherwise a
        # token minted for a completely different Google app would be
        # accepted here too.
        expected_client_id = settings.GOOGLE_OAUTH2_CLIENT_ID
        if not expected_client_id or payload.get("aud") != expected_client_id:
            logger.warning("Google token audience mismatch (got %s)", payload.get("aud"))
            return Response({"detail": "Google credential was not issued for this application."}, status=401)

        email = (payload.get("email") or "").strip().lower()
        if not email:
            return Response({"detail": "Google account has no email."}, status=400)
        if payload.get("email_verified") not in ("true", True):
            return Response({"detail": "Google email is not verified."}, status=401)

        name = payload.get("name") or email.split("@")[0]

        user = User.objects(email=email).first()
        if user is None:
            # New user via Google -- create a company automatically so
            # sign-in completes in one step; the business name can be
            # corrected afterward in Profile settings.
            company = Company(name=f"{name}'s Company", email=email)
            company.save()
            user = User(
                name=name,
                email=email,
                company=company,
                username=email.split("@")[0],
                last_login=timezone.now(),
            )
            # Social-login accounts still need SOME password hash on the
            # User document (set_password with a random value) since
            # nothing else about this model assumes a nullable password --
            # the user simply never uses it, since they always sign in via
            # Google.
            user.set_password(secrets.token_urlsafe(32))
            user.save()
        else:
            user.last_login = timezone.now()
            user.save()

        return Response(_auth_response(user))
