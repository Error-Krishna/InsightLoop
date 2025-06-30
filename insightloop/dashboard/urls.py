from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('api/summary/', views.summary_data, name='summary-data'),
    path('api/charts/rev_exp/', views.rev_exp_chart, name='rev-exp-chart'),
    path('api/charts/profit_trends/', views.profit_trends, name='profit-trends'),
]