from django.urls import include, path


urlpatterns = [
    path("api/v1/ai/", include("aiexport.api_urls")),
]
