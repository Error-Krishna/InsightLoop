from django.urls import path

from .api_views import MarkPaidApiView, WorkerDetailApiView, WorkerMaterialsApiView, WorkerPaymentsApiView, WorkersCollectionApiView


urlpatterns = [
    path("", WorkersCollectionApiView.as_view(), name="api-workers"),
    path("<str:worker_id>/", WorkerDetailApiView.as_view(), name="api-worker-detail"),
    path("<str:worker_id>/materials/", WorkerMaterialsApiView.as_view(), name="api-worker-materials"),
    path("<str:worker_id>/payments/", WorkerPaymentsApiView.as_view(), name="api-worker-payments"),
    path("payments/<str:payment_id>/mark-paid/", MarkPaidApiView.as_view(), name="api-worker-payment-mark-paid"),
]
