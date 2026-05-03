from django.urls import include, path


urlpatterns = [
    path("api/v1/upload/", include("upload.api_urls")),
]
