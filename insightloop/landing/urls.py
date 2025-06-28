from django.urls import path, include
from . import views
# from rest_framework.routers import DefaultRouter
# from .views import ProductViewSet

# router = DefaultRouter()
# router.register(r'products', ProductViewSet)

urlpatterns = [
    # path('api/', include(router.urls)),
    path('', views.home, name='home'),
    path('features', views.features, name='features'),
    path('pricing', views.pricing, name='pricing'),
    path('faq', views.faq, name='faq'),
    path('contact', views.contact_view, name='contact'),
    path('login', views.login_view, name='login'),
    path('signup', views.signup_view, name='signup'),
]