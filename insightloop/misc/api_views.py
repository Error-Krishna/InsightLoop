from datetime import datetime

from django.core.files.storage import default_storage
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from insightloop.api_utils import AuthenticatedAPIView, serialize_value
from landing.mongo_models import User


def _save_upload(company_id, upload_file, prefix):
    filename = default_storage.save(f"profile/{company_id}/{prefix}_{upload_file.name}", upload_file)
    return default_storage.url(filename)


def _get_profile_pic_url(user):
    try:
        pic = user.profile_pic
        if pic and hasattr(pic, "grid_id") and pic.grid_id:
            return f"/api/v1/profile/pic/{str(pic.grid_id)}/"
    except Exception:
        pass
    return None


def _serialize_profile(user):
    company = user.company
    return {
        "user": {
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "location": user.location,
            "username": user.username,
            "profile_pic": _get_profile_pic_url(user),
        },
        "company": {
            "company_id": str(company.company_id),
            "name": company.name,
            "address": company.address,
            "email": company.email,
            "phone": company.phone,
            "gst_number": company.gst_number,
            "logo_url": company.logo_url,
            "stamp_url": company.stamp_url,
            "signature_url": company.signature_url,
            "bank_account_number": company.bank_account_number,
            "ifsc_code": company.ifsc_code,
            "bank_name": company.bank_name,
            "branch_name": company.branch_name,
        },
    }


class ProfileApiView(AuthenticatedAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        user = User.objects.get(email=request.user.email)
        return Response(_serialize_profile(user))

    def put(self, request):
        user = User.objects.get(email=request.user.email)
        company = user.company

        user.name = request.data.get("name", user.name)
        user.phone = request.data.get("phone", user.phone)
        user.location = request.data.get("location", user.location)
        user.username = request.data.get("username", user.username)

        company.name = request.data.get("company_name", company.name)
        company.address = request.data.get("address", company.address)
        company.email = request.data.get("company_email", company.email or user.email)
        company.phone = request.data.get("company_phone", company.phone or user.phone)
        company.gst_number = request.data.get("gst_number", company.gst_number)
        company.bank_account_number = request.data.get("bank_account_number", company.bank_account_number)
        company.ifsc_code = request.data.get("ifsc_code", company.ifsc_code)
        company.bank_name = request.data.get("bank_name", company.bank_name)
        company.branch_name = request.data.get("branch_name", company.branch_name)

        if request.FILES.get("logo"):
            company.logo_url = _save_upload(company.company_id, request.FILES["logo"], "logo")
        if request.FILES.get("stamp"):
            company.stamp_url = _save_upload(company.company_id, request.FILES["stamp"], "stamp")
        if request.FILES.get("signature"):
            company.signature_url = _save_upload(company.company_id, request.FILES["signature"], "signature")

        company.updated_at = datetime.now()
        company.save()
        user.save()
        user.reload()

        return Response(_serialize_profile(user))
