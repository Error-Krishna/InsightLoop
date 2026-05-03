from django.urls import path

from .api_views import (
    DashboardOverviewApiView,
    DashboardSummaryApiView,
    ProfitTrendsApiView,
    RevenueExpenseApiView,
    TopWorkersApiView,
    WorkerPaymentsApiView,
)


urlpatterns = [
    path("overview/", DashboardOverviewApiView.as_view(), name="api-dashboard-overview"),
    path("summary/", DashboardSummaryApiView.as_view(), name="api-dashboard-summary"),
    path("rev-exp/", RevenueExpenseApiView.as_view(), name="api-dashboard-rev-exp"),
    path("profit-trends/", ProfitTrendsApiView.as_view(), name="api-dashboard-profit-trends"),
    path("workers/", WorkerPaymentsApiView.as_view(), name="api-dashboard-workers"),
    path("top-workers/", TopWorkersApiView.as_view(), name="api-dashboard-top-workers"),
]
