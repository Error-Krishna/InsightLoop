import csv
from io import StringIO

from bson import ObjectId
from django.http import HttpResponse
from rest_framework.response import Response

from insightloop.api_utils import AuthenticatedAPIView, get_company_id, serialize_value

from .models import Insight
from .views import analyze_sales_data


def _serialize_insight(insight):
    return {
        "id": str(insight.id),
        "title": insight.title,
        "description": insight.description,
        "labels": insight.labels,
        "data_points": insight.data_points,
        "note": insight.note or "",
        "created_at": serialize_value(insight.created_at),
    }


class InsightsListApiView(AuthenticatedAPIView):
    def get(self, request):
        company_id = get_company_id(request)
        insights = Insight.objects(company_id=company_id).order_by("-created_at")
        return Response([_serialize_insight(insight) for insight in insights])


class InsightsAnalyzeApiView(AuthenticatedAPIView):
    def post(self, request):
        company_id = get_company_id(request)
        generated = analyze_sales_data(company_id)
        created = []

        for item in generated:
            insight = Insight(
                company_id=company_id,
                title=item["title"],
                description=item["description"],
                labels=item["labels"],
                data_points=item["data_points"],
            )
            insight.save()
            created.append(_serialize_insight(insight))

        return Response({"count": len(created), "insights": created})


class InsightDetailApiView(AuthenticatedAPIView):
    def delete(self, request, insight_id):
        company_id = get_company_id(request)
        insight = Insight.objects.get(id=ObjectId(insight_id), company_id=company_id)
        insight.delete()
        return Response(status=204)


class InsightExportApiView(AuthenticatedAPIView):
    def get(self, request, insight_id):
        company_id = get_company_id(request)
        insight = Insight.objects.get(id=ObjectId(insight_id), company_id=company_id)

        csv_buffer = StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(["Insight Title", "Description", "Note"])
        writer.writerow([insight.title, insight.description, insight.note or ""])
        writer.writerow([])
        writer.writerow(["Period", "Value"])
        for label, value in zip(insight.labels, insight.data_points):
            writer.writerow([label, value])

        response = HttpResponse(csv_buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="insight_{insight_id}.csv"'
        return response
