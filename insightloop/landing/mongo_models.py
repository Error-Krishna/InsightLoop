# from mongoengine import Document, StringField, FloatField

# class Product(Document):
#     name = StringField(required=True, max_length=100)
#     price = FloatField(required=True)

from mongoengine import Document, StringField, EmailField
from django.contrib.auth.hashers import make_password, check_password

class User(Document):
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