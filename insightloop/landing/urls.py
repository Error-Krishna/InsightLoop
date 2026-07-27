from django.urls import path
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect
from . import views


def root_redirect(request):
    """This backend is API-only now (the real frontend is the separate
    React app on Vercel) -- redirect anyone landing on the bare backend
    URL to the actual product instead of showing a raw Django page.

    Falls back to a small JSON health-check response if FRONTEND_ORIGIN
    isn't configured, so this never 500s even if that env var is missing.
    """
    if settings.FRONTEND_ORIGIN:
        return redirect(settings.FRONTEND_ORIGIN)
    return JsonResponse({"status": "ok", "service": "InsightLoop API"})


urlpatterns = [
    path('', root_redirect, name='home'),
    path('contact', views.contact_view, name='contact'),
]