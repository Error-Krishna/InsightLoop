from mongoengine import Document, StringField, EmailField, ReferenceField, DictField, DateTimeField
from django.contrib.auth.hashers import make_password, check_password
import uuid
from datetime import datetime
from mongoengine import FileField


def default_notifications():
    return {
        "comments": True,
        "weekly_summary": False,
        "updates": True,
    }


def default_workspace_settings():
    return {
        "realtime_dashboard_refresh": True,
        "jwt_session_authentication": True,
        "ai_assistant_enabled": True,
        "inventory_workspace_mode": True,
    }

class Company(Document):
    company_id = StringField(required=True, default=lambda: str(uuid.uuid4()))
    name = StringField(required=True, max_length=100)
    business_type = StringField(max_length=100, default="Data & Insights Platform")
    address = StringField(required=False)
    email = EmailField(required=False)
    phone = StringField(max_length=20, required=False)
    gst_number = StringField(max_length=50, required=False)
    logo_url = StringField(required=False)
    stamp_url = StringField(required=False)
    signature_url = StringField(required=False)
    bank_account_number = StringField(required=False)
    ifsc_code = StringField(required=False)
    bank_name = StringField(required=False)
    branch_name = StringField(required=False)
    workspace_settings = DictField(default=default_workspace_settings)
    created_at = DateTimeField(default=datetime.now)
    updated_at = DateTimeField(default=datetime.now)

class User(Document):
    company = ReferenceField(Company, required=True)
    name = StringField(required=True, max_length=100)
    email = EmailField(required=True, unique=True)
    password = StringField(required=True)
    phone = StringField(max_length=20, required=False)
    location = StringField(max_length=100, required=False)
    username = StringField(max_length=50, required=False)
    created_at = DateTimeField(default=datetime.now)
    last_login = DateTimeField(default=datetime.now)
    subscription = StringField(default="Pro Plan (₹499/mo)")
    notifications = DictField(default=default_notifications)
    profile_pic = FileField(collection_name='profile_pics', null=True, blank=True)

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    def __str__(self):
        return self.email
    

class ContactMessage(Document):
    name = StringField(required=True, max_length=100)
    email = EmailField(required=True)
    message = StringField(required=True, max_length=1000)
    created_at = DateTimeField(default=datetime.now)
