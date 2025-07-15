from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.staticfiles.views import serve as static_serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('landing.urls')),
    path('dashboard/', include('dashboard.urls')),
    path('insights/', include('insights.urls')),
    path('upload/', include('upload.urls')),
    path('distribution/', include('worker.urls')),
    path('aiexport/', include('aiexport.urls')),
    path('user/', include('misc.urls')),



]

if settings.DEBUG:
    # Development static files
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # Production static file fallback
    urlpatterns += [
        re_path(r'^static/(?P<path>.*)$', 
                lambda request, path: static_serve(request, path, insecure=True)),
    ]