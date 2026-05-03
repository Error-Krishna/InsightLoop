import csv
from datetime import datetime
from io import TextIOWrapper

from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from dashboard.management.commands.process_uploaded_data import generate_financial_summaries
from insightloop.api_utils import AuthenticatedAPIView, get_company_id, serialize_value

from .models import BusinessData


class CsvUploadApiView(AuthenticatedAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        company_id = str(get_company_id(request))
        csv_file = request.FILES.get("file") or request.FILES.get("csv_file")
        if not csv_file:
            return Response({"detail": "CSV file is required."}, status=400)

        if not csv_file.name.endswith(".csv"):
            return Response({"detail": "Please upload a valid CSV file."}, status=400)

        io_string = TextIOWrapper(csv_file.file, encoding="utf-8-sig")
        reader = csv.DictReader(io_string)
        required_columns = {"date", "product", "quantity", "production_cost", "selling_price", "region", "customer_type"}
        if not required_columns.issubset(set(reader.fieldnames or [])):
            missing = sorted(required_columns - set(reader.fieldnames or []))
            return Response({"detail": "Missing required columns.", "missing": missing}, status=400)

        created = 0
        warnings = []
        for row_num, row in enumerate(reader, start=1):
            try:
                BusinessData(
                    company_id=company_id,
                    date=datetime.strptime(row["date"], "%Y-%m-%d").date(),
                    product=row["product"],
                    category=row.get("category", ""),
                    quantity=int(row["quantity"]),
                    production_cost=float(row["production_cost"]),
                    selling_price=float(row["selling_price"]),
                    region=row["region"],
                    customer_type=row["customer_type"],
                ).save()
                created += 1
            except Exception as exc:  # pragma: no cover - defensive around user input
                warnings.append({"row": row_num, "detail": str(exc)})

        if created:
            generate_financial_summaries(company_id)

        return Response({"created": created, "warnings": warnings})


class ManualUploadApiView(AuthenticatedAPIView):
    def post(self, request):
        company_id = str(get_company_id(request))
        record = BusinessData(
            company_id=company_id,
            date=datetime.strptime(request.data["date"], "%Y-%m-%d").date(),
            product=request.data["product"],
            category=request.data.get("category", ""),
            quantity=int(request.data["quantity"]),
            production_cost=float(request.data["production_cost"]),
            selling_price=float(request.data["selling_price"]),
            region=request.data["region"],
            customer_type=request.data["customer_type"],
        )
        record.save()
        generate_financial_summaries(company_id)
        return Response(
            {
                "id": str(record.id),
                "date": serialize_value(record.date),
                "product": record.product,
                "category": record.category,
                "quantity": record.quantity,
                "production_cost": record.production_cost,
                "selling_price": record.selling_price,
                "region": record.region,
                "customer_type": record.customer_type,
            },
            status=201,
        )
