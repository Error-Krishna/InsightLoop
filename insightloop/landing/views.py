from datetime import datetime
from django.shortcuts import render, redirect, reverse
from django.conf import settings
from django.core.mail import EmailMessage
from django.contrib import messages
from django.views.decorators.csrf import csrf_protect
import requests
import logging
from .mongo_models import User, Company, ContactMessage
from .auth_backends import MongoAuthBackend
from django.utils.crypto import get_random_string

logger = logging.getLogger(__name__)

def contact_view(request):
    if request.method == 'POST':
        name = request.POST.get('name')
        email = request.POST.get('email')
        message = request.POST.get('message')

        # Save to MongoDB using MongoEngine
        ContactMessage(name=name, email=email, message=message).save()

        # Send email to admin
        try:
            email_message = EmailMessage(
                subject='New Contact Message',
                body=f"Name: {name}\nEmail: {email}\n\nMessage:\n{message}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[settings.ADMIN_EMAIL],
                headers={'Reply-To': email}
            )
            email_message.send(fail_silently=False)

        except Exception as e:
            print("Email sending failed:", e)

        return redirect('login')  # or to a thank you page

    return redirect('/#contact')

def home(request):
    return render (request, 'landing/home.html')

def features(request):
    return  redirect ('/#features')

def pricing(request):
    return  redirect ('/#pricing')

def faq(request):
    return  redirect ('/#faq')

def contact(request):
    return  redirect ('/#contact')

@csrf_protect
def signup_view(request):
    if request.method == 'POST':
        name = request.POST.get('name')
        email = request.POST.get('email')
        password = request.POST.get('password')
        company_name = request.POST.get('company_name', 'My Company')

        if User.objects(email=email).first():
            messages.error(request, "Email already registered.")
            return redirect('signup')

        # Create company
        company = Company(name=company_name)
        company.save()

        # Create user
        user = User(name=name, email=email, company=company)
        user.set_password(password)
        user.save()

        messages.success(request, "Account created. Please log in.")
        return redirect('login')

    return render(request, 'landing/login-signup.html')

@csrf_protect
def login_view(request):
    if request.method == 'POST':
        email = request.POST.get('email')
        password = request.POST.get('password')
        backend = MongoAuthBackend()
        user = backend.authenticate(request, email=email, password=password)
        
        if user is not None:
            # Set session variables
            request.session['user_email'] = user.email
            request.session['user_name'] = user.name
            request.session['company_id'] = str(user.company.company_id)
            request.session['company_name'] = user.company.name
            
            # Update last login
            user.last_login = datetime.now()
            user.save()
            
            return redirect('dashboard')
        else:
            messages.error(request, "Invalid email or password")
            return render(request, 'landing/login-signup.html', {'active_tab': 'login'})
    else:
        return render(request, 'landing/login-signup.html', {'active_tab': 'login'})

def logout_view(request):
    # Clear session data
    request.session.flush()
    return redirect('home')


def google_auth(request):
    # Generate OAuth2 URL
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_OAUTH2_CLIENT_ID}&"
        "response_type=code&"
        f"redirect_uri={settings.GOOGLE_REDIRECT_URI}&"
        "scope=openid%20email%20profile&"
        "access_type=offline"
    )
    return redirect(auth_url)

def google_callback(request):
    """Handle Google OAuth2 callback"""
    code = request.GET.get('code')
    if not code:
        messages.error(request, "Google authentication failed: No authorization code")
        return redirect('login')
    
    # Exchange code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        'code': code,
        'client_id': settings.GOOGLE_OAUTH2_CLIENT_ID,
        'client_secret': settings.GOOGLE_OAUTH2_CLIENT_SECRET,
        'redirect_uri': settings.GOOGLE_REDIRECT_URI,
        'grant_type': 'authorization_code'
    }
    
    try:
        response = requests.post(token_url, data=data, timeout=10)
        response.raise_for_status()
        token_data = response.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            messages.error(request, "Google authentication failed: No access token")
            return redirect('login')
        
        # Get user info from Google
        user_info_url = "https://www.googleapis.com/oauth2/v2/userinfo"
        headers = {'Authorization': f'Bearer {access_token}'}
        user_info = requests.get(user_info_url, headers=headers, timeout=10).json()
        
        if 'email' not in user_info:
            messages.error(request, "Google authentication failed: No email in response")
            return redirect('login')
        
        # Check if user exists
        email = user_info['email']
        name = user_info.get('name', email.split('@')[0])
        picture = user_info.get('picture', '')
        
        try:
            user = User.objects.get(email=email)
            # Existing user - log them in
            request.session['user_email'] = user.email
            request.session['user_name'] = user.name
            request.session['company_id'] = str(user.company.company_id)
            request.session['company_name'] = user.company.name
            user.last_login = datetime.now()
            user.save()
            return redirect('dashboard')
        except User.DoesNotExist:
            # New user - redirect to company name form
            return redirect(reverse('social_signup_company') + 
                          f'?email={email}&name={name}&provider=google&profile_pic={picture}')
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Google authentication error: {str(e)}")
        messages.error(request, "Failed to authenticate with Google")
        return redirect('login')

def github_auth(request):
    """Initiate GitHub OAuth2 flow"""
    auth_url = (
        "https://github.com/login/oauth/authorize?"
        f"client_id={settings.GITHUB_CLIENT_ID}&"
        f"redirect_uri={settings.GITHUB_REDIRECT_URI}&"
        "scope=user:email"
    )
    return redirect(auth_url)

def github_callback(request):
    """Handle GitHub OAuth2 callback"""
    code = request.GET.get('code')
    if not code:
        messages.error(request, "GitHub authentication failed: No authorization code")
        return redirect('login')
    
    # Exchange code for access token
    token_url = "https://github.com/login/oauth/access_token"
    data = {
        'client_id': settings.GITHUB_CLIENT_ID,
        'client_secret': settings.GITHUB_CLIENT_SECRET,
        'code': code,
        'redirect_uri': settings.GITHUB_REDIRECT_URI
    }
    headers = {'Accept': 'application/json'}
    
    try:
        response = requests.post(token_url, data=data, headers=headers, timeout=10)
        response.raise_for_status()
        token_data = response.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            messages.error(request, "GitHub authentication failed: No access token")
            return redirect('login')
        
        # Get user info from GitHub
        user_info_url = "https://api.github.com/user"
        headers = {'Authorization': f'token {access_token}'}
        user_info = requests.get(user_info_url, headers=headers, timeout=10).json()
        
        # Get primary email
        emails_url = "https://api.github.com/user/emails"
        emails = requests.get(emails_url, headers=headers, timeout=10).json()
        primary_email = next((e['email'] for e in emails if e['primary'] and e['verified']), None)
        
        if not primary_email:
            # Try to get any verified email
            verified_emails = [e['email'] for e in emails if e['verified']]
            if verified_emails:
                primary_email = verified_emails[0]
            else:
                messages.error(request, "GitHub authentication failed: No verified email found")
                return redirect('login')
        
        # Get user name (handle missing name field)
        name = user_info.get('name')
        if not name:
            # Try to get from login or email
            name = user_info.get('login', primary_email.split('@')[0])
        
        # Get avatar URL
        avatar_url = user_info.get('avatar_url', '')
        
        # Check if user exists
        try:
            user = User.objects.get(email=primary_email)
            # Existing user - log them in
            request.session['user_email'] = user.email
            request.session['user_name'] = user.name
            request.session['company_id'] = str(user.company.company_id)
            request.session['company_name'] = user.company.name
            user.last_login = datetime.now()
            user.save()
            return redirect('dashboard')
        except User.DoesNotExist:
            # New user - redirect to company name form
            return redirect(reverse('social_signup_company') + 
                          f'?email={primary_email}&name={name}&provider=github&profile_pic={avatar_url}')
    
    except requests.exceptions.RequestException as e:
        logger.error(f"GitHub authentication error: {str(e)}")
        messages.error(request, "Failed to authenticate with GitHub")
        return redirect('login')

def linkedin_auth(request):
    """Initiate LinkedIn OAuth2 flow"""
    # LinkedIn requires state parameter for CSRF protection
    state = get_random_string(16)
    request.session['linkedin_state'] = state
    
    auth_url = (
        "https://www.linkedin.com/oauth/v2/authorization?"
        f"response_type=code&"
        f"client_id={settings.LINKEDIN_CLIENT_ID}&"
        f"redirect_uri={settings.LINKEDIN_REDIRECT_URI}&"
        "scope=r_liteprofile%20r_emailaddress&"
        f"state={state}"
    )
    return redirect(auth_url)

def linkedin_callback(request):
    """Handle LinkedIn OAuth2 callback"""
    code = request.GET.get('code')
    state = request.GET.get('state')
    stored_state = request.session.get('linkedin_state')
    
    if not code:
        messages.error(request, "LinkedIn authentication failed: No authorization code")
        return redirect('login')
    
    if state != stored_state:
        messages.error(request, "LinkedIn authentication failed: Invalid state parameter")
        return redirect('login')
    
    # Exchange code for access token
    token_url = "https://www.linkedin.com/oauth/v2/accessToken"
    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': settings.LINKEDIN_REDIRECT_URI,
        'client_id': settings.LINKEDIN_CLIENT_ID,
        'client_secret': settings.LINKEDIN_CLIENT_SECRET
    }
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    
    try:
        response = requests.post(token_url, data=data, headers=headers, timeout=10)
        response.raise_for_status()
        token_data = response.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            messages.error(request, "LinkedIn authentication failed: No access token")
            return redirect('login')
        
        # Get user info from LinkedIn
        # First get profile info
        profile_url = "https://api.linkedin.com/v2/me"
        headers = {
            'Authorization': f'Bearer {access_token}',
            'X-Restli-Protocol-Version': '2.0.0'
        }
        profile_info = requests.get(profile_url, headers=headers, timeout=10).json()
        
        # Get email address
        email_url = "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))"
        email_info = requests.get(email_url, headers=headers, timeout=10).json()
        
        # Extract email
        email_element = email_info.get('elements', [{}])[0]
        email_data = email_element.get('handle~', {})
        primary_email = email_data.get('emailAddress')
        
        if not primary_email:
            messages.error(request, "LinkedIn authentication failed: No email found")
            return redirect('login')
        
        # Get user name
        localized_name = profile_info.get('localizedLastName')
        localized_first_name = profile_info.get('localizedFirstName')
        name = f"{localized_first_name} {localized_name}" if localized_first_name and localized_name else primary_email.split('@')[0]
        
        # Check if user exists
        try:
            user = User.objects.get(email=primary_email)
            # Existing user - log them in
            request.session['user_email'] = user.email
            request.session['user_name'] = user.name
            request.session['company_id'] = str(user.company.company_id)
            request.session['company_name'] = user.company.name
            user.last_login = datetime.now()
            user.save()
            return redirect('dashboard')
        except User.DoesNotExist:
            # New user - redirect to company name form
            return redirect(reverse('social_signup_company') + 
                          f'?email={primary_email}&name={name}&provider=linkedin')
    
    except requests.exceptions.RequestException as e:
        logger.error(f"LinkedIn authentication error: {str(e)}")
        messages.error(request, "Failed to authenticate with LinkedIn")
        return redirect('login')

def social_signup_company(request):
    """Handle company name input for new social signups"""
    if request.method == 'POST':
        email = request.POST.get('email')
        name = request.POST.get('name')
        company_name = request.POST.get('company_name')
        phone = request.POST.get('phone')
        provider = request.POST.get('provider')
        profile_pic_url = request.POST.get('profile_pic_url', '')
        profile_pic_file = request.FILES.get('profile_pic', None)
        
        # Validate input
        if not email or not company_name:
            messages.error(request, "Please fill in all required fields")
            return render(request, 'landing/social_signup_company.html', {
                'email': email,
                'name': name,
                'provider': provider,
                'profile_pic': profile_pic_url
            })
        
        # Create user and company
        backend = MongoAuthBackend()
        try:
            user = backend.create_user_from_social(
                email=email,
                name=name,
                company_name=company_name,
                phone=phone,
                profile_pic_url=profile_pic_url,
                profile_pic_file=profile_pic_file,
                provider=provider
            )
            
            if user:
                # Set session variables
                request.session['user_email'] = user.email
                request.session['user_name'] = user.name
                request.session['company_id'] = str(user.company.company_id)
                request.session['company_name'] = user.company.name
                
                # Update last login
                user.last_login = datetime.now()
                user.save()
                
                return redirect('dashboard')
        except Exception as e:
            logger.error(f"Error creating user: {str(e)}")
            messages.error(request, "Failed to create user account. Please try again.")
        
        return redirect('signup')
    
    # Handle GET request - show form
    email = request.GET.get('email')
    name = request.GET.get('name')
    provider = request.GET.get('provider')
    profile_pic = request.GET.get('profile_pic', '')
    
    if not email or not provider:
        messages.error(request, "Invalid signup request")
        return redirect('signup')
    
    return render(request, 'landing/social_signup_company.html', {
        'email': email,
        'name': name,
        'provider': provider,
        'profile_pic': profile_pic
    })