from django.urls import include, path


urlpatterns = [
    path("api/v1/auth/", include("landing.auth_urls")),
]
