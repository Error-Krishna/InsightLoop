from django.shortcuts import render
from django.http import JsonResponse
from .data_service import get_summary_data, get_worker_payments
from .queries import get_rev_exp_data, get_profit_trends, get_top_workers

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
    months = int(request.GET.get('months', 1))
    return JsonResponse({
        'workers': get_worker_payments(months)
    })

def top_workers(request):
    months = int(request.GET.get('months', 3))
    limit = int(request.GET.get('limit', 5))
    workers = get_top_workers(months, limit)
    return JsonResponse(workers, safe=False)

def dashboard(request):
    return render(request, 'dashboard/Dashboard.html')