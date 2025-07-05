from django.shortcuts import render, redirect
from django.conf import settings
from django.core.mail import EmailMessage
from django.contrib.auth.hashers import check_password
from django.contrib import messages
from django.views.decorators.csrf import csrf_protect
from .mongo_models import User, ContactMessage, Company
import uuid

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

        user = User.objects(email=email).first()
        if user and user.check_password(password):
            # Set session data
            request.session['user_email'] = user.email
            request.session['user_name'] = user.name
            request.session['company_id'] = str(user.company.company_id)
            request.session['company_name'] = user.company.name
            
            # Explicitly save session to ensure persistence
            request.session.modified = True

            messages.success(request, f"Welcome, {user.name}!")
            # Redirect to dashboard with trailing slash
            return redirect('dashboard')  
        else:
            messages.error(request, "Invalid email or password.")
            return redirect('login')

    return render(request, 'landing/login-signup.html')

def logout_view(request):
    request.session.flush()
    messages.success(request, "You have been logged out.")
    return redirect('home')