from django.contrib import admin
from django.urls import path
from . import views

urlpatterns = [
    path('', views.insights, name='insights'),
]
