from django.urls import path
from . import views

urlpatterns = [
    path('pay_distribution/', views.pay_distribution, name='pay_distribution'),
    path('pay_distribution/workers/', views.get_workers, name='get_workers'),
    path('pay_distribution/records/', views.get_payment_records, name='get_payment_records'),
    path('pay_distribution/create/', views.create_payment_record, name='create_payment_record'),
    path('pay_distribution/mark_paid/<str:record_id>/', views.mark_paid, name='mark_paid'),
    path('pay_distribution/delete/<str:record_id>/', views.delete_payment_record, name='delete_payment_record'),
    path('pay_distribution/add_worker/', views.add_worker, name='add_worker'),
    path('pay_distribution/worker_stats/<str:worker_id>', views.get_worker_stats, name='worker_stats'),
    path('material_distribution/', views.material_distribution, name='material_distribution'),
    path('material_distribution/add_batch/<str:assignment_id>', 
         views.add_batch_to_assignment, 
         name='add_batch_to_assignment'),
    path('material_distribution/delete/<str:assignment_id>/', 
         views.delete_assignment, 
         name='delete_assignment'),
    path('pay_distribution/update_paid/<str:record_id>/', views.update_paid_amount, name='update_paid_amount'),
]