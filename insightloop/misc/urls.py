from django.urls import path
from . import views



urlpatterns = [
    path('profile/', views.profile, name='profile'),
    path('billing/', views.billing, name='billing'),
    path('settings/', views.settings, name='settings'),


] 