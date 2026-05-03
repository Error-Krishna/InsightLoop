from rest_framework.response import Response

from insightloop.api_utils import AuthenticatedAPIView, get_company_id

from .data_service import get_summary_data
from .queries import get_profit_trends, get_rev_exp_data
from .utils import get_dashboard_data, get_top_workers, get_worker_payments


class DashboardOverviewApiView(AuthenticatedAPIView):
    def get(self, request):
        return Response(get_dashboard_data(get_company_id(request)))


class DashboardSummaryApiView(AuthenticatedAPIView):
    def get(self, request):
        return Response(get_summary_data(get_company_id(request)))


class RevenueExpenseApiView(AuthenticatedAPIView):
    def get(self, request):
        months = int(request.GET.get("months", 6))
        return Response(get_rev_exp_data(get_company_id(request), months))


class ProfitTrendsApiView(AuthenticatedAPIView):
    def get(self, request):
        months = int(request.GET.get("months", 6))
        interval = request.GET.get("interval", "monthly")
        return Response(get_profit_trends(get_company_id(request), months, interval))


class WorkerPaymentsApiView(AuthenticatedAPIView):
    def get(self, request):
        return Response({"workers": get_worker_payments(get_company_id(request))})


class TopWorkersApiView(AuthenticatedAPIView):
    def get(self, request):
        return Response({"workers": get_top_workers(get_company_id(request))})
