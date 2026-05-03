from django.urls import path

from .api_views import InsightDetailApiView, InsightExportApiView, InsightsAnalyzeApiView, InsightsListApiView


urlpatterns = [
    path("", InsightsListApiView.as_view(), name="api-insights-list"),
    path("analyze/", InsightsAnalyzeApiView.as_view(), name="api-insights-analyze"),
    path("<str:insight_id>/", InsightDetailApiView.as_view(), name="api-insight-detail"),
    path("<str:insight_id>/export/", InsightExportApiView.as_view(), name="api-insight-export"),
]
