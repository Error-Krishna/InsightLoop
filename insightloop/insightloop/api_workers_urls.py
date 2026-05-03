from django.urls import include, path


urlpatterns = [
    path("api/v1/workers/", include("worker.api_urls")),
]
