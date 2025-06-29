from django.urls import path
from . import views

urlpatterns = [
    path('', views.insights, name='insights'),
    path('delete/<insight_id>/', views.delete_insight, name='delete_insight'),
]