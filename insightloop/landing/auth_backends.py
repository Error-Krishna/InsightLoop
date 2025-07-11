from django.contrib.auth.backends import BaseBackend
from .mongo_models import User, Company
from django.utils.crypto import get_random_string
from django.contrib.auth.hashers import make_password
from datetime import datetime
from django.core.files.uploadedfile import InMemoryUploadedFile
import requests
from io import BytesIO
from django.core.files import File

class MongoAuthBackend(BaseBackend):
    def create_user_from_social(self, email, name, company_name, phone, 
                               profile_pic_url='', profile_pic_file=None, provider=''):
        # Create company
        company = Company(
            name=company_name,
            business_type="Technology"
        )
        company.save()
        
        # Generate secure random password
        password = get_random_string(50)
        username = email.split('@')[0]
        
        # Ensure we have a valid name
        if not name:
            name = username
            
        # Handle profile picture
        profile_pic = None
        if profile_pic_url and not profile_pic_file:
            # Download social profile picture
            try:
                response = requests.get(profile_pic_url)
                if response.status_code == 200:
                    img_data = BytesIO(response.content)
                    img_name = f"{username}_{provider}_profile.jpg"
                    if profile_pic_url and not profile_pic_file:
                        try:
                            response = requests.get(profile_pic_url)
                            if response.status_code == 200:
                                img_data = BytesIO(response.content)
                                img_name = f"{username}_{provider}_profile.jpg"
                                # Use Django's ContentFile
                                from django.core.files.base import ContentFile
                                profile_pic = ContentFile(img_data.getvalue(), name=img_name)
                        except Exception as e:
                            print(f"Error downloading profile picture: {e}")
            except Exception as e:
                print(f"Error downloading profile picture: {e}")
        elif profile_pic_file:
            # Use uploaded file
            profile_pic = profile_pic_file
        
        # Create user
        user = User(
            company=company,
            name=name,
            email=email,
            phone=phone,
            username=username,
            subscription="Pro Plan (₹499/mo)",
            last_login=datetime.now(),
            profile_pic=profile_pic
        )
        user.set_password(password)
        user.save()
        return user
    
    def authenticate(self, request, email=None, password=None, **kwargs):
        try:
            user = User.objects.get(email=email)
            if user.check_password(password):
                # Update last login
                user.last_login = datetime.now()
                user.save()
                return user
            return None
        except User.DoesNotExist:
            return None

    def get_user(self, user_id):
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    def authenticate_with_google(self, email, name):
        try:
            # Try to find existing user
            user = User.objects.get(email=email)
            return user
        except User.DoesNotExist:
            # Create new user and company
            company = Company(
                name=f"{name}'s Company",
                business_type="Technology"
            )
            company.save()
            
            # Generate secure random password
            password = get_random_string(50)
            user = User(
                company=company,
                name=name,
                email=email,
                username=email.split('@')[0],
                subscription="Pro Plan (₹499/mo)",
                last_login=datetime.now()
            )
            user.set_password(password)
            user.save()
            return user
        
    def authenticate_with_github(self, email, name=None):
        try:
            # Try to find existing user
            user = User.objects.get(email=email)
            return user
        except User.DoesNotExist:
            # Create new user and company
            company_name = f"{name}'s Company" if name else f"{email}'s Company"
            company = Company(
                name=company_name,
                business_type="Technology"
            )
            company.save()
            
            # Generate secure random password
            password = get_random_string(50)
            username = email.split('@')[0]
            
            # Ensure we have a valid name
            if not name:
                name = username
                
            user = User(
                company=company,
                name=name,
                email=email,
                username=username,
                subscription="Pro Plan (₹499/mo)",
                last_login=datetime.now()
            )
            user.set_password(password)
            user.save()
            return user