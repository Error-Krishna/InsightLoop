import json
from datetime import date, datetime
from decimal import Decimal

from bson import ObjectId
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView


class AuthenticatedAPIView(APIView):
    permission_classes = [IsAuthenticated]


class PublicAPIView(APIView):
    permission_classes = [AllowAny]


def get_company_id(request):
    return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)


def serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: serialize_value(val) for key, val in value.items()}
    return value


def parse_json_body(request):
    if isinstance(request.data, dict):
        return request.data
    try:
        return json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {}
