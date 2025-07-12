from django.shortcuts import render, redirect
from django.http import HttpResponseForbidden, JsonResponse
from django.conf import settings  # Correct import for settings
from .data_service import get_summary_data
from .queries import get_rev_exp_data, get_profit_trends
from .utils import get_worker_payments, get_top_workers
from .encoders import CustomJSONEncoder


# Custom authentication check
def is_authenticated(request):
    return hasattr(request, 'company_id') and request.company_id and 'user_email' in request.session

def dashboard(request):
    """Dashboard home view that checks for authentication"""
    if not is_authenticated(request):
        return redirect(f'{settings.LOGIN_URL}?next={request.path}')
    return render(request, 'dashboard/Dashboard.html')

def summary_data(request):
    if not is_authenticated(request):
        return HttpResponseForbidden("You are not authorized to view this page.")
    return JsonResponse(get_summary_data(request.company_id))

def rev_exp_chart(request):
    if not is_authenticated(request):
        return HttpResponseForbidden("You are not authorized to view this page.")
    months = int(request.GET.get('months', 6))
    return JsonResponse(get_rev_exp_data(request.company_id, months))

def profit_trends(request):
    if not is_authenticated(request):
        return HttpResponseForbidden("You are not authorized to view this page.")
    interval = request.GET.get('interval', 'monthly')
    months = int(request.GET.get('months', 6))
    return JsonResponse(get_profit_trends(request.company_id, months, interval))

def worker_payments(request):
    if not is_authenticated(request):
        return HttpResponseForbidden("You are not authorized to view this page.")
    return JsonResponse({'workers': get_worker_payments(request.company_id)})

def top_workers(request):
    if not is_authenticated(request):
        return HttpResponseForbidden("You are not authorized to view this page.")
    workers = get_top_workers(request.company_id)
    return JsonResponse(
        {'workers': workers},
        encoder=CustomJSONEncoder
    )