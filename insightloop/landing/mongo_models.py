from django.forms import FileField
from mongoengine import Document, StringField, EmailField, ReferenceField, DictField, DateTimeField
from django.contrib.auth.hashers import make_password, check_password
import uuid
from datetime import datetime
from mongoengine import FileField

class Company(Document):
    company_id = StringField(required=True, default=lambda: str(uuid.uuid4()))
    name = StringField(required=True, max_length=100)
    business_type = StringField(max_length=100, default="Data & Insights Platform")
    created_at = DateTimeField(default=datetime.now)

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
    notifications = DictField(default={
        "comments": True,
        "weekly_summary": False,
        "updates": True
    })
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