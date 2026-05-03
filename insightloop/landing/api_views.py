from datetime import datetime

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from insightloop.api_utils import serialize_value

from .auth_backends import MongoAuthBackend
from .authentication import issue_tokens_for_user
from .mongo_models import Company, User


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


class SignupApiView(APIView):
    permission_classes = [AllowAny]

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
            last_login=datetime.now(),
        )
        user.set_password(password)
        user.save()

        return Response(_auth_response(user), status=201)


class LoginApiView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""

        if not email or not password:
            return Response({"detail": "Email and password are required."}, status=400)

        backend = MongoAuthBackend()
        user = backend.authenticate(request, email=email, password=password)
        if user is None:
            return Response({"detail": "Invalid email or password."}, status=401)

        user.last_login = datetime.now()
        user.save()
        return Response(_auth_response(user))
