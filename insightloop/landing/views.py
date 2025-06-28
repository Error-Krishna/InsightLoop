from django.shortcuts import render, redirect
from django.conf import settings
from django.core.mail import EmailMessage
from django.contrib.auth.hashers import check_password
from django.contrib import messages
from django.views.decorators.csrf import csrf_protect
from django.contrib.auth import get_user_model
from .mongo_models import User, ContactMessage




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



from django.contrib import messages



# from rest_framework import viewsets
# from .mongo_models import Product
# from .serializers import ProductSerializer

# class ProductViewSet(viewsets.ModelViewSet):
#     queryset = Product.objects.all()
#     serializer_class = ProductSerializer

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
def login(request):
    return render(request, 'landing/login-signup.html')

@csrf_protect
def signup_view(request):
    if request.method == 'POST':
        name = request.POST.get('name')
        email = request.POST.get('email')
        password = request.POST.get('password')

        if User.objects(email=email).first():
            messages.error(request, "Email already registered.")
            return redirect('signup')

        user = User(name=name, email=email)
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
            # Set session manually (since not using Django auth backend)
            request.session['user_email'] = user.email
            request.session['user_name'] = user.name

            messages.success(request, f"Welcome, {user.name}!")
            return redirect('/dashboard')  # Change this to your logged-in page
        else:
            messages.error(request, "Invalid email or password.")
            return redirect('login')

    return render(request, 'landing/login-signup.html')