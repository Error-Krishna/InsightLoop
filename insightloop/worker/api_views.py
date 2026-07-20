from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from mongoengine import ValidationError as MongoValidationError
from mongoengine.errors import NotUniqueError
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from insightloop.api_utils import AuthenticatedAPIView, get_company_id, serialize_value
from bills.models import Bill

from .models import MaterialAssignment, PayRecord, Worker


def _validate_bill_id(bill_id, company_id):
    """If a bill_id is supplied, confirm it refers to a real bill in this
    company before linking a material assignment to it -- prevents a typo'd
    or cross-tenant id from silently attaching production cost to nothing
    (or, worse, being invisibly ignored later when the bill's cost is
    computed).
    """
    if not bill_id:
        return None
    try:
        object_id = ObjectId(bill_id)
    except (InvalidId, TypeError):
        raise ValidationError({"detail": "Invalid bill id."})
    if not Bill.objects(id=object_id, company_id=company_id).first():
        raise ValidationError({"detail": "That bill was not found for this company."})
    return bill_id


def _get_worker(worker_id, company_id):
    try:
        object_id = ObjectId(worker_id)
    except (InvalidId, TypeError):
        raise ValidationError({"detail": "Invalid worker id."})
    try:
        return Worker.objects.get(id=object_id, company_id=company_id)
    except Worker.DoesNotExist:
        raise NotFound({"detail": "Worker not found."})


def _get_assignment(assignment_id, company_id):
    try:
        object_id = ObjectId(assignment_id)
    except (InvalidId, TypeError):
        raise ValidationError({"detail": "Invalid material assignment id."})
    try:
        return MaterialAssignment.objects.get(id=object_id, company_id=company_id)
    except MaterialAssignment.DoesNotExist:
        raise NotFound({"detail": "Material assignment not found."})


def _get_payment(payment_id, company_id):
    try:
        object_id = ObjectId(payment_id)
    except (InvalidId, TypeError):
        raise ValidationError({"detail": "Invalid payment id."})
    try:
        return PayRecord.objects.get(id=object_id, company_id=company_id)
    except PayRecord.DoesNotExist:
        raise NotFound({"detail": "Payment record not found."})


def _serialize_worker(worker, company_id):
    assignments = MaterialAssignment.objects(worker=worker, company_id=company_id)
    payments = PayRecord.objects(worker=worker, company_id=company_id)
    pending_amount = 0
    for record in payments:
        total_amount = record.units_produced * record.rate_per_unit
        if not (record.paid or record.amount_paid >= total_amount):
            pending_amount += total_amount - (record.amount_paid or 0)

    completed_assignments = [a for a in assignments if a.status == "completed"]
    total_assigned_completed = sum(a.quantity for a in completed_assignments)
    total_wasted = sum(a.wastage_quantity or 0 for a in completed_assignments)
    wastage_rate = round((total_wasted / total_assigned_completed) * 100, 1) if total_assigned_completed else 0.0

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
        "open_assignments": sum(1 for a in assignments if a.status == "open"),
        "total_wasted": total_wasted,
        "wastage_rate": wastage_rate,
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
        "status": item.status,
        "completed_at": serialize_value(item.completed_at) if item.completed_at else None,
        "wastage_quantity": item.wastage_quantity,
        "over_returned": item.over_returned,
        "bill_id": item.bill_id,
        "wage_amount": item.wage_amount,
        "pay_record_id": item.pay_record_id,
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
        "bill_id": item.bill_id,
        "source_assignment_id": item.source_assignment_id,
    }


class WorkersCollectionApiView(AuthenticatedAPIView):
    def get(self, request):
        company_id = get_company_id(request)
        workers = Worker.objects(company_id=company_id).order_by("-created_at")
        return Response([_serialize_worker(worker, company_id) for worker in workers])

    def post(self, request):
        company_id = get_company_id(request)
        name = (request.data.get("name") or "").strip()
        if not name:
            raise ValidationError({"detail": "Worker name is required."})
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
            name=name,
            age=int(request.data["age"]) if request.data.get("age") else None,
            address=request.data.get("address"),
            phone=request.data.get("phone"),
            image_url=request.data.get("image_url"),
            joining_date=joining_date,
        )
        try:
            worker.save()
        except MongoValidationError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(_serialize_worker(worker, company_id), status=201)


class WorkerMaterialsApiView(AuthenticatedAPIView):
    def get(self, request, worker_id):
        company_id = get_company_id(request)
        worker = _get_worker(worker_id, company_id)
        materials = MaterialAssignment.objects(worker=worker, company_id=company_id).order_by("-assignment_date")
        return Response([_serialize_material(item) for item in materials])

    def post(self, request, worker_id):
        company_id = get_company_id(request)
        worker = _get_worker(worker_id, company_id)
        raw_date = request.data.get("date")
        if raw_date:
            try:
                assignment_date = datetime.strptime(raw_date[:10], "%Y-%m-%d")
            except Exception:
                assignment_date = datetime.now()
        else:
            assignment_date = datetime.now()

        quantity = int(request.data.get("quantity", 0) or 0)
        if quantity <= 0:
            raise ValidationError({"detail": "Quantity must be a positive number."})

        wage_amount = float(request.data.get("wage_amount", 0) or 0)
        if wage_amount < 0:
            raise ValidationError({"detail": "Wage amount cannot be negative."})

        bill_id = _validate_bill_id(request.data.get("bill_id"), company_id)

        item = MaterialAssignment(
            company_id=company_id,
            worker=worker,
            material_name=request.data.get("material_name"),
            quantity=quantity,
            price_per_unit=float(request.data.get("price_per_unit", 0)),
            assignment_date=assignment_date,
            notes=request.data.get("notes", ""),
            batches=request.data.get("batches", []),
            wage_amount=wage_amount,
            bill_id=bill_id,
        )
        try:
            item.save()
        except MongoValidationError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(_serialize_material(item), status=201)


class MaterialBatchApiView(AuthenticatedAPIView):
    """Record a partial return (a 'chunk') against an open material
    assignment -- e.g. a worker who took 500 pieces of raw material
    returns it over several visits (100, 50, 50, 200, 40, 60...).
    """

    def post(self, request, assignment_id):
        company_id = get_company_id(request)
        assignment = _get_assignment(assignment_id, company_id)
        if assignment.status == "completed":
            raise ValidationError(
                {"detail": "This assignment is already marked complete. Reopen it before adding more batches."}
            )

        quantity = int(request.data.get("quantity", 0) or 0)
        if quantity <= 0:
            raise ValidationError({"detail": "Batch quantity must be a positive number."})

        raw_date = request.data.get("date")
        if raw_date:
            try:
                batch_date = datetime.strptime(raw_date[:10], "%Y-%m-%d")
            except Exception:
                batch_date = datetime.now()
        else:
            batch_date = datetime.now()

        batch = {
            "quantity": quantity,
            "date": batch_date.isoformat(),
            "notes": request.data.get("notes", ""),
        }
        assignment.batches = (assignment.batches or []) + [batch]
        assignment.updated_at = datetime.now()
        assignment.save()
        return Response(_serialize_material(assignment), status=201)


class MaterialCompleteApiView(AuthenticatedAPIView):
    """Manually close out an assignment once all chunks are accounted for,
    computing wastage as assigned-quantity minus total returned. This is a
    deliberate user action rather than an automatic trigger, since in
    practice a worker's return count reaching the assigned amount doesn't
    necessarily mean the job is actually finished (and vice versa -- a job
    can be considered done with a shortfall that becomes the wastage figure).

    If this assignment is linked to a bill (bill_id set), completing it is
    also the moment the worker's pay becomes due -- MaterialAssignment.complete()
    auto-creates the PayRecord -- and the bill's worker_assignment_ids cache
    is updated so the order's production view picks it up immediately.
    """

    def put(self, request, assignment_id):
        company_id = get_company_id(request)
        assignment = _get_assignment(assignment_id, company_id)
        if assignment.status == "completed":
            raise ValidationError({"detail": "This assignment is already marked complete."})
        try:
            assignment.complete()
        except (MongoValidationError, NotUniqueError) as exc:
            # complete() saves incrementally as each step succeeds (see its
            # docstring), so a failure here does NOT leave the assignment
            # half-completed -- whatever step failed hasn't been marked
            # done, and simply retrying this same request will resume from
            # there rather than redo already-successful steps.
            raise ValidationError(
                {"detail": f"Could not complete this assignment: {exc}. No changes from a partial attempt were left behind -- it's safe to try again."}
            )

        if assignment.bill_id:
            try:
                object_id = ObjectId(assignment.bill_id)
            except (InvalidId, TypeError):
                object_id = None
            if object_id is not None:
                bill = Bill.objects(id=object_id, company_id=company_id).first()
                if bill is not None and str(assignment.id) not in (bill.worker_assignment_ids or []):
                    bill.worker_assignment_ids = (bill.worker_assignment_ids or []) + [str(assignment.id)]
                    bill.save()

        return Response(_serialize_material(assignment))


class WorkerPaymentsApiView(AuthenticatedAPIView):
    def get(self, request, worker_id):
        company_id = get_company_id(request)
        worker = _get_worker(worker_id, company_id)
        payments = PayRecord.objects(worker=worker, company_id=company_id).order_by("-date")
        return Response([_serialize_payment(item) for item in payments])

    def post(self, request, worker_id):
        company_id = get_company_id(request)
        worker = _get_worker(worker_id, company_id)
        units = int(request.data.get("units_produced", 0) or 0)
        rate = float(request.data.get("rate_per_unit", 0) or 0)
        if units <= 0:
            raise ValidationError({"detail": "Units produced must be a positive number."})
        if rate <= 0:
            raise ValidationError({"detail": "Rate per unit must be a positive number."})
        total_owed = units * rate
        amount_paid = float(request.data.get("amount_paid", 0) or 0)
        if amount_paid < 0:
            raise ValidationError({"detail": "Amount paid cannot be negative."})
        if amount_paid > total_owed:
            raise ValidationError(
                {"detail": f"Amount paid (₹{amount_paid}) cannot exceed the total owed (₹{total_owed})."}
            )
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
            paid=amount_paid >= total_owed,
            date=payment_date,
        )
        try:
            payment.save()
        except MongoValidationError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(_serialize_payment(payment), status=201)


class MarkPaidApiView(AuthenticatedAPIView):
    def put(self, request, payment_id):
        company_id = get_company_id(request)
        payment = _get_payment(payment_id, company_id)
        payment.amount_paid = payment.units_produced * payment.rate_per_unit
        payment.paid = True
        payment.updated_at = datetime.now()
        payment.save()
        return Response(_serialize_payment(payment))


class RecordPartialPaymentApiView(AuthenticatedAPIView):
    """Log one installment paid toward a worker's pay record, mirroring how
    a bill's customer payments and a material assignment's returned chunks
    are logged. amount_paid accumulates; paid flips true automatically once
    the running total reaches the full value owed.
    """

    def post(self, request, payment_id):
        company_id = get_company_id(request)
        payment = _get_payment(payment_id, company_id)
        total_owed = payment.units_produced * payment.rate_per_unit
        if payment.paid or payment.amount_paid >= total_owed:
            raise ValidationError({"detail": "This payment record is already fully paid."})

        amount = float(request.data.get("amount", 0) or 0)
        if amount <= 0:
            raise ValidationError({"detail": "Payment amount must be a positive number."})

        payment.amount_paid = round((payment.amount_paid or 0) + amount, 2)
        if payment.amount_paid >= total_owed:
            payment.paid = True
        payment.updated_at = datetime.now()
        payment.save()
        return Response(_serialize_payment(payment), status=201)


class WorkerDetailApiView(AuthenticatedAPIView):
    def get(self, request, worker_id):
        company_id = get_company_id(request)
        worker = _get_worker(worker_id, company_id)
        return Response(_serialize_worker(worker, company_id))

    def put(self, request, worker_id):
        company_id = get_company_id(request)
        worker = _get_worker(worker_id, company_id)

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
        worker = _get_worker(worker_id, company_id)
        worker.delete()
        return Response(status=204)
