from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('landing.urls')),
    path('dashboard/', include('dashboard.urls')),
    path('insights/', include('insights.urls')),
    path('upload/', include('upload.urls')),
    path('distribution/', include('worker.urls')),
    path('aiexport/', include('aiexport.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)