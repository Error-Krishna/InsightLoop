from datetime import datetime

from bson import ObjectId
from rest_framework.response import Response

from insightloop.api_utils import AuthenticatedAPIView, get_company_id, serialize_value

from .models import MaterialAssignment, PayRecord, Worker


def _serialize_worker(worker, company_id):
    assignments = MaterialAssignment.objects(worker=worker, company_id=company_id)
    payments = PayRecord.objects(worker=worker, company_id=company_id)
    pending_amount = 0
    for record in payments:
        total_amount = record.units_produced * record.rate_per_unit
        if not (record.paid or record.amount_paid >= total_amount):
            pending_amount += total_amount - (record.amount_paid or 0)

    return {
        "id": str(worker.id),
        "name": worker.name,
        "age": worker.age,
        "address": worker.address,
        "phone": worker.phone,
        "image_url": worker.image_url,
        "joining_date": serialize_value(worker.joining_date),
        "is_active": worker.is_active,
        "material_assigned": sum(item.quantity for item in assignments),
        "material_delivered": sum(item.delivered_quantity for item in assignments),
        "pending_amount": round(pending_amount, 2),
        "created_at": serialize_value(worker.created_at),
        "updated_at": serialize_value(worker.updated_at),
    }


def _serialize_material(item):
    return {
        "id": str(item.id),
        "worker_id": str(item.worker.id) if item.worker else None,
        "material_name": item.material_name,
        "quantity": item.quantity,
        "price_per_unit": item.price_per_unit,
        "assignment_date": serialize_value(item.assignment_date),
        "notes": item.notes or "",
        "batches": serialize_value(item.batches or []),
        "delivered_quantity": item.delivered_quantity,
        "balance_quantity": item.balance_quantity,
        "total_value": item.total_value,
    }


def _serialize_payment(item):
    total_amount = item.units_produced * item.rate_per_unit
    return {
        "id": str(item.id),
        "worker_id": str(item.worker.id) if item.worker else None,
        "worker_name": item.worker.name if item.worker else "Unknown",
        "product_name": item.product_name,
        "units_produced": item.units_produced,
        "rate_per_unit": item.rate_per_unit,
        "amount_paid": item.amount_paid,
        "total_amount": total_amount,
        "date": serialize_value(item.date),
        "paid": item.paid or item.amount_paid >= total_amount,
    }


class WorkersCollectionApiView(AuthenticatedAPIView):
    def get(self, request):
        company_id = get_company_id(request)
        workers = Worker.objects(company_id=company_id).order_by("-created_at")
        return Response([_serialize_worker(worker, company_id) for worker in workers])

    def post(self, request):
        company_id = get_company_id(request)
        raw_date = request.data.get("joining_date")
        joining_date = None
        if raw_date:
            try:
                joining_date = datetime.strptime(raw_date[:10], "%Y-%m-%d")
            except Exception:
                joining_date = datetime.now()
        else:
            joining_date = datetime.now()

        worker = Worker(
            company_id=company_id,
            name=request.data.get("name"),
            age=int(request.data["age"]) if request.data.get("age") else None,
            address=request.data.get("address"),
            phone=request.data.get("phone"),
            image_url=request.data.get("image_url"),
            joining_date=joining_date,
        )
        worker.save()
        return Response(_serialize_worker(worker, company_id), status=201)


class WorkerMaterialsApiView(AuthenticatedAPIView):
    def get(self, request, worker_id):
        company_id = get_company_id(request)
        worker = Worker.objects.get(id=ObjectId(worker_id), company_id=company_id)
        materials = MaterialAssignment.objects(worker=worker, company_id=company_id).order_by("-assignment_date")
        return Response([_serialize_material(item) for item in materials])

    def post(self, request, worker_id):
        company_id = get_company_id(request)
        worker = Worker.objects.get(id=ObjectId(worker_id), company_id=company_id)
        raw_date = request.data.get("date")
        if raw_date:
            try:
                assignment_date = datetime.strptime(raw_date[:10], "%Y-%m-%d")
            except Exception:
                assignment_date = datetime.now()
        else:
            assignment_date = datetime.now()

        item = MaterialAssignment(
            company_id=company_id,
            worker=worker,
            material_name=request.data.get("material_name"),
            quantity=int(request.data.get("quantity", 0)),
            price_per_unit=float(request.data.get("price_per_unit", 0)),
            assignment_date=assignment_date,
            notes=request.data.get("notes", ""),
            batches=request.data.get("batches", []),
        )
        item.save()
        return Response(_serialize_material(item), status=201)


class WorkerPaymentsApiView(AuthenticatedAPIView):
    def get(self, request, worker_id):
        company_id = get_company_id(request)
        worker = Worker.objects.get(id=ObjectId(worker_id), company_id=company_id)
        payments = PayRecord.objects(worker=worker, company_id=company_id).order_by("-date")
        return Response([_serialize_payment(item) for item in payments])

    def post(self, request, worker_id):
        company_id = get_company_id(request)
        worker = Worker.objects.get(id=ObjectId(worker_id), company_id=company_id)
        units = int(request.data.get("units_produced", 0))
        rate = float(request.data.get("rate_per_unit", 0))
        amount_paid = float(request.data.get("amount_paid", 0))
        raw_date = request.data.get("date")
        if raw_date:
            try:
                payment_date = datetime.strptime(raw_date[:10], "%Y-%m-%d")
            except Exception:
                payment_date = datetime.now()
        else:
            payment_date = datetime.now()

        payment = PayRecord(
            company_id=company_id,
            worker=worker,
            product_name=request.data.get("product_name"),
            units_produced=units,
            rate_per_unit=rate,
            amount_paid=amount_paid,
            paid=amount_paid >= units * rate,
            date=payment_date,
        )
        payment.save()
        return Response(_serialize_payment(payment), status=201)


class MarkPaidApiView(AuthenticatedAPIView):
    def put(self, request, payment_id):
        company_id = get_company_id(request)
        payment = PayRecord.objects.get(id=ObjectId(payment_id), company_id=company_id)
        payment.amount_paid = payment.units_produced * payment.rate_per_unit
        payment.paid = True
        payment.updated_at = datetime.now()
        payment.save()
        return Response(_serialize_payment(payment))


class WorkerDetailApiView(AuthenticatedAPIView):
    def get(self, request, worker_id):
        company_id = get_company_id(request)
        worker = Worker.objects.get(id=ObjectId(worker_id), company_id=company_id)
        return Response(_serialize_worker(worker, company_id))

    def put(self, request, worker_id):
        company_id = get_company_id(request)
        worker = Worker.objects.get(id=ObjectId(worker_id), company_id=company_id)

        raw_date = request.data.get("joining_date")
        if raw_date:
            try:
                worker.joining_date = datetime.strptime(raw_date[:10], "%Y-%m-%d")
            except Exception:
                pass

        worker.name = request.data.get("name", worker.name)
        worker.age = int(request.data["age"]) if request.data.get("age") else worker.age
        worker.address = request.data.get("address", worker.address)
        worker.phone = request.data.get("phone", worker.phone)
        worker.image_url = request.data.get("image_url", worker.image_url)
        if "is_active" in request.data:
            is_active = request.data.get("is_active")
            worker.is_active = is_active if isinstance(is_active, bool) else str(is_active).strip().lower() in {"1", "true", "yes", "on"}
        worker.updated_at = datetime.now()
        worker.save()
        return Response(_serialize_worker(worker, company_id))

    def delete(self, request, worker_id):
        company_id = get_company_id(request)
        worker = Worker.objects.get(id=ObjectId(worker_id), company_id=company_id)
        worker.delete()
        return Response(status=204)
