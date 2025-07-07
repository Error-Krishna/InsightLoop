from django.urls import path
from . import views

urlpatterns = [
    path('', views.ai_export, name='aiexport'),
]
