from dataclasses import dataclass

from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .mongo_models import User


@dataclass
class MongoAPIUser:
    mongo_user: User
    token_payload: dict

    @property
    def is_authenticated(self):
        return True

    @property
    def email(self):
        return self.mongo_user.email

    @property
    def name(self):
        return self.mongo_user.name

    @property
    def company_id(self):
        return str(self.mongo_user.company.company_id)

    def __getattr__(self, item):
        return getattr(self.mongo_user, item)


def issue_tokens_for_user(user):
    refresh = RefreshToken()
    refresh["email"] = user.email
    refresh["company_id"] = str(user.company.company_id)
    refresh["user_id"] = str(user.id)
    refresh["name"] = user.name
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


class MongoJWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = get_authorization_header(request).split()
        if not header:
            return None

        if len(header) != 2 or header[0].lower() != b"bearer":
            raise AuthenticationFailed("Invalid authorization header")

        token = header[1].decode("utf-8")
        try:
            payload = AccessToken(token)
        except TokenError as exc:
            raise AuthenticationFailed("Invalid or expired token") from exc

        email = payload.get("email")
        if not email:
            raise AuthenticationFailed("Token missing email claim")

        try:
            mongo_user = User.objects.get(email=email)
        except User.DoesNotExist as exc:
            raise AuthenticationFailed("User not found") from exc

        request.company_id = str(mongo_user.company.company_id)
        request.user_email = mongo_user.email
        request.user_name = mongo_user.name
        request.company_name = mongo_user.company.name

        return MongoAPIUser(mongo_user, payload), payload
