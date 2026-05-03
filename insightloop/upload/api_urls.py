from django.urls import path

from .api_views import CsvUploadApiView, ManualUploadApiView


urlpatterns = [
    path("csv/", CsvUploadApiView.as_view(), name="api-upload-csv"),
    path("manual/", ManualUploadApiView.as_view(), name="api-upload-manual"),
]
