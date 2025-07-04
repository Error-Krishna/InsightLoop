from django.shortcuts import render
from django.http import JsonResponse
from .data_service import get_summary_data
from .queries import get_rev_exp_data, get_profit_trends
from .utils import get_worker_payments, get_top_workers  # Add these
from .encoders import CustomJSONEncoder

def summary_data(request):
    return JsonResponse(get_summary_data())

def rev_exp_chart(request):
    months = int(request.GET.get('months', 6))
    return JsonResponse(get_rev_exp_data(months))

def profit_trends(request):
    interval = request.GET.get('interval', 'monthly')
    months = int(request.GET.get('months', 6))
    return JsonResponse(get_profit_trends(months, interval))

def worker_payments(request):
    return JsonResponse({'workers': get_worker_payments()})

def top_workers(request):
    workers = get_top_workers()
    return JsonResponse(
        {'workers': workers},
        encoder=CustomJSONEncoder  # Change this line
    )

def dashboard(request):
    return render(request, 'dashboard/Dashboard.html')