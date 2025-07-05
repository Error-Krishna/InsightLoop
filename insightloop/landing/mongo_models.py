# from mongoengine import Document, StringField, FloatField
from mongoengine import Document, StringField, EmailField, ReferenceField
from django.contrib.auth.hashers import make_password, check_password
import uuid

class Company(Document):
    company_id = StringField(required=True, default=lambda: str(uuid.uuid4()))
    name = StringField(required=True, max_length=100)

class User(Document):
    company = ReferenceField(Company, required=True)
    name = StringField(required=True, max_length=100)
    email = EmailField(required=True, unique=True)
    password = StringField(required=True)

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    def __str__(self):
        return self.email
    
class ContactMessage(Document):
    name = StringField(required=True, max_length=100)
    email = EmailField(required=True)
    message = StringField(required=True)