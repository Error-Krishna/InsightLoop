from django.conf import settings
from django.core.mail import EmailMessage
from django.http import JsonResponse
from .mongo_models import ContactMessage

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

        return JsonResponse({"status": "ok"})

    return JsonResponse({"detail": "Use POST to submit the contact form."}, status=405)


# ---------------------------------------------------------------------
# NOTE: the legacy session-based page views and OAuth flows that used to
# live in this file (home/features/pricing/faq/login_view/signup_view/
# logout_view/google_auth/google_callback/github_auth/github_callback/
# linkedin_auth/linkedin_callback/social_signup_company) have been removed.
#
# The real, current auth system is entirely JSON/JWT-based and lives in
# landing/api_views.py (LoginApiView, SignupApiView, GoogleLoginApiView) --
# that's what the React frontend (hosted separately on Vercel) actually
# calls. Those old views rendered Django templates and used Django
# sessions, which the React SPA never used and can't use (it authenticates
# with a JWT in an Authorization header, not a session cookie), so they
# were dead code serving a page nobody was supposed to see, at the backend
# domain's root URL, instead of a proper redirect to the real frontend.
# ---------------------------------------------------------------------