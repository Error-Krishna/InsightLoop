from django.urls import include, path


urlpatterns = [
    path("api/v1/dashboard/", include("dashboard.api_urls")),
]
