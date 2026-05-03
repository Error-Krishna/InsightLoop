from django.urls import include, path


urlpatterns = [
    path("api/v1/insights/", include("insights.api_urls")),
]
