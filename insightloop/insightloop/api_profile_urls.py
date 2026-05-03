from django.urls import include, path


urlpatterns = [
    path("api/v1/profile/", include("misc.api_urls")),
]
