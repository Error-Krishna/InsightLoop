from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('features', views.features, name='features'),
    path('pricing', views.pricing, name='pricing'),
    path('faq', views.faq, name='faq'),
    path('contact', views.contact_view, name='contact'),
    path('login', views.login_view, name='login'),
    path('signup', views.signup_view, name='signup'),
    path('logout', views.logout_view, name='logout'),  # New logout path
]