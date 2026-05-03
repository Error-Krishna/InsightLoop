from django.urls import include, path

from bills.urls import router as bills_router
from inventory.urls import router as inv_router


urlpatterns = [
    path("auth/", include("landing.auth_urls")),
    path("dashboard/", include("dashboard.api_urls")),
    path("", include(bills_router.urls)),
    path("", include(inv_router.urls)),
    path("insights/", include("insights.api_urls")),
    path("workers/", include("worker.api_urls")),
    path("upload/", include("upload.api_urls")),
    path("profile/", include("misc.api_urls")),
    path("ai/", include("aiexport.api_urls")),
]
