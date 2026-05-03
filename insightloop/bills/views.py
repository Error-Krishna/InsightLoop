from bson import ObjectId
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter
from rest_framework.viewsets import ViewSet

from insightloop.api_utils import serialize_value

from .models import Bill


def _serialize_bill(bill):
    return {
        "id": str(bill.id),
        "company_id": bill.company_id,
        "bill_type": bill.bill_type,
        "buyer": serialize_value(bill.buyer),
        "products": serialize_value(bill.products),
        "subtotal": bill.subtotal,
        "gst_percentage": bill.gst_percentage,
        "gst_amount": bill.gst_amount,
        "discount": bill.discount,
        "grand_total": bill.grand_total,
        "invoice_number": bill.invoice_number,
        "created_at": serialize_value(bill.created_at),
        "updated_at": serialize_value(bill.updated_at),
    }


def _normalize_products(products):
    normalized = []
    subtotal = 0
    for product in products or []:
        quantity = float(product.get("quantity", 0) or 0)
        rate = float(product.get("rate", product.get("price", product.get("unit_price", 0))) or 0)
        total = round(quantity * rate, 2)
        normalized.append(
            {
                "name": product.get("name") or product.get("product_name"),
                "description": product.get("description", ""),
                "quantity": quantity,
                "rate": rate,
                "unit": product.get("unit", "pcs"),
                "total": total,
            }
        )
        subtotal += total
    return normalized, round(subtotal, 2)


def _build_bill_payload(data, bill_type, existing=None):
    products, subtotal = _normalize_products(data.get("products", []))
    discount = float(data.get("discount", 0) or 0)
    gst_percentage = float(data.get("gst_percentage", 0) or 0) if bill_type == "pakka" else 0
    taxable_amount = max(subtotal - discount, 0)
    gst_amount = round(taxable_amount * gst_percentage / 100, 2)
    grand_total = round(taxable_amount + gst_amount, 2)

    buyer = {
        "name": data.get("buyer_name") or data.get("buyer", {}).get("name"),
        "address": data.get("buyer_address") or data.get("buyer", {}).get("address"),
        "gst_number": data.get("gst_number") or data.get("buyer", {}).get("gst_number"),
    }

    payload = {
        "bill_type": bill_type,
        "buyer": buyer,
        "products": products,
        "subtotal": subtotal,
        "gst_percentage": gst_percentage,
        "gst_amount": gst_amount,
        "discount": discount,
        "grand_total": grand_total,
    }

    if existing:
        payload["invoice_number"] = existing.invoice_number
    return payload


class BillViewSet(ViewSet):
    def _company_id(self, request):
        return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)

    def list(self, request):
        company_id = self._company_id(request)
        bill_type = request.GET.get("type")
        bills = Bill.objects(company_id=company_id)
        if bill_type:
            bills = bills.filter(bill_type=bill_type)
        bills = bills.order_by("-created_at")
        return Response([_serialize_bill(bill) for bill in bills])

    def update(self, request, pk=None):
        company_id = self._company_id(request)
        bill = Bill.objects.get(id=ObjectId(pk), company_id=company_id)
        payload = _build_bill_payload(request.data, request.data.get("bill_type", bill.bill_type), existing=bill)
        for field, value in payload.items():
            setattr(bill, field, value)
        bill.save()
        return Response(_serialize_bill(bill))

    def destroy(self, request, pk=None):
        company_id = self._company_id(request)
        bill = Bill.objects.get(id=ObjectId(pk), company_id=company_id)
        bill.delete()
        return Response(status=204)

    @action(detail=False, methods=["post"], url_path="kacha")
    def create_kacha(self, request):
        return self._create_bill(request, "kacha")

    @action(detail=False, methods=["post"], url_path="pakka")
    def create_pakka(self, request):
        return self._create_bill(request, "pakka")

    @action(detail=True, methods=["post"], url_path="convert")
    def convert(self, request, pk=None):
        company_id = self._company_id(request)
        bill = Bill.objects.get(id=ObjectId(pk), company_id=company_id)
        payload = _build_bill_payload(request.data or bill.to_mongo().to_dict(), "pakka", existing=bill)
        for field, value in payload.items():
            setattr(bill, field, value)
        bill.bill_type = "pakka"
        bill.save()
        return Response(_serialize_bill(bill))

    def _create_bill(self, request, bill_type):
        company_id = self._company_id(request)
        payload = _build_bill_payload(request.data, bill_type)
        bill = Bill(company_id=company_id, invoice_number="", **payload)
        bill.save()
        return Response(_serialize_bill(bill), status=201)


router = DefaultRouter()
router.register("bills", BillViewSet, basename="bills")
