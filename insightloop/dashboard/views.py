from django.shortcuts import render
from django.http import JsonResponse
from .data_service import get_summary_data
from .queries import get_rev_exp_data, get_profit_trends

def summary_data(request):
    return JsonResponse(get_summary_data())

def rev_exp_chart(request):
    months = int(request.GET.get('months', 6))
    return JsonResponse(get_rev_exp_data(months))

def profit_trends(request):
    interval = request.GET.get('interval', 'monthly')
    months = int(request.GET.get('months', 6))
    return JsonResponse(get_profit_trends(months, interval))

def dashboard(request):
    return render(request, 'dashboard/Dashboard.html')