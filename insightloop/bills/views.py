from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime
from django.http import HttpResponse
from mongoengine.errors import NotUniqueError
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter
from rest_framework.viewsets import ViewSet

from django.conf import settings

from insightloop.api_utils import serialize_value
from inventory.models import InventoryItem
from landing.mongo_models import Company

from .models import Bill, generate_invoice_number
from .pdf import BillPdfRenderError, render_bill_pdf
from .profit import compute_suggested_profit
from .whatsapp import WhatsAppNotConfigured, WhatsAppSendError, share_bill_pdf as share_bill_pdf_meta
# TEMPORARY -- see WHATSAPP_PROVIDER in insightloop/settings.py for the
# removal checklist. Remove this import once real Meta credentials are set.
from .whatsapp_openwa import OpenWANotConfigured, OpenWASendError, share_bill_pdf as share_bill_pdf_openwa

MAX_INVOICE_NUMBER_ATTEMPTS = 5


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
        "payments": serialize_value(bill.payments or []),
        "amount_received": bill.amount_received,
        "balance_due": bill.balance_due,
        "payment_status": bill.payment_status,
        "over_received": bill.over_received,
        "profit_confirmed": bill.profit_confirmed,
        "profit_suggested_amount": bill.profit_suggested_amount,
        "profit_confirmed_amount": bill.profit_confirmed_amount,
        "profit_confirmed_at": serialize_value(bill.profit_confirmed_at) if bill.profit_confirmed_at else None,
        "worker_assignment_ids": bill.worker_assignment_ids or [],
        "worker_cost_total": bill.worker_cost_total,
        "transportation_costs": serialize_value(bill.transportation_costs or []),
        "transportation_cost_total": bill.transportation_cost_total,
        "misc_costs": serialize_value(bill.misc_costs or []),
        "misc_cost_total": bill.misc_cost_total,
        "ready_to_deliver": serialize_value(bill.ready_to_deliver or []),
        "ready_to_deliver_quantity": bill.ready_to_deliver_quantity,
        "shipment_confirmed": bill.shipment_confirmed,
        "shipment_confirmed_at": serialize_value(bill.shipment_confirmed_at) if bill.shipment_confirmed_at else None,
        "order_status": bill.order_status,
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
        # inventory_item_id is optional: a line item is only linked to stock
        # when the user picked an existing inventory item. Freeform line
        # items (not in inventory) are still fully supported for billing.
        normalized.append(
            {
                "name": product.get("name") or product.get("product_name"),
                "description": product.get("description", ""),
                "quantity": quantity,
                "rate": rate,
                "unit": product.get("unit", "pcs"),
                "total": total,
                "inventory_item_id": product.get("inventory_item_id") or None,
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
        "phone": data.get("buyer_phone") or data.get("buyer", {}).get("phone"),
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


def _stock_deltas(products):
    """Sum quantities per inventory_item_id from a list of bill product lines."""
    deltas = {}
    for product in products or []:
        item_id = product.get("inventory_item_id")
        if not item_id:
            continue
        deltas[item_id] = deltas.get(item_id, 0) + float(product.get("quantity", 0) or 0)
    return deltas


def _apply_stock_change(company_id, item_id, delta):
    """Adjust InventoryItem.quantity by -delta (selling reduces stock).

    Silently skips items that no longer exist or belong to another company --
    an inventory item can be deleted after a bill referencing it was created,
    and that shouldn't block billing operations.
    """
    try:
        object_id = ObjectId(item_id)
    except (InvalidId, TypeError):
        return
    InventoryItem.objects(id=object_id, company_id=company_id).update(dec__quantity=delta)


def _validate_stock_available(company_id, deltas):
    """Raise a clean 400 if any linked item doesn't have enough stock.

    Only linked lines (inventory_item_id present) are checked -- freeform
    line items with no inventory link are never blocked, since inventory
    tracking is optional per item.
    """
    shortages = []
    for item_id, requested_qty in deltas.items():
        try:
            object_id = ObjectId(item_id)
        except (InvalidId, TypeError):
            continue
        item = InventoryItem.objects(id=object_id, company_id=company_id).first()
        if item is None:
            continue  # item was deleted since being added to the bill; don't block billing
        if item.quantity < requested_qty:
            shortages.append(
                f"{item.name}: requested {requested_qty} {item.unit}, only {item.quantity} {item.unit} in stock"
            )
    if shortages:
        raise ValidationError({"detail": "Insufficient stock: " + "; ".join(shortages)})


def _reconcile_stock_on_create(company_id, products):
    deltas = _stock_deltas(products)
    _validate_stock_available(company_id, deltas)
    for item_id, qty in deltas.items():
        _apply_stock_change(company_id, item_id, qty)


def _reconcile_stock_on_update(company_id, old_products, new_products):
    """Restore old quantities, then deduct new ones -- so edits (change qty,
    swap item, remove a line) correctly adjust stock rather than double-count.
    """
    old_deltas = _stock_deltas(old_products)
    new_deltas = _stock_deltas(new_products)
    # Validate against stock as it would be *after* restoring the old
    # quantities, so editing a bill back down doesn't get blocked by its own
    # original deduction.
    net_deltas = {}
    for item_id in set(old_deltas) | set(new_deltas):
        net_deltas[item_id] = new_deltas.get(item_id, 0) - old_deltas.get(item_id, 0)
    positive_only = {k: v for k, v in net_deltas.items() if v > 0}
    _validate_stock_available(company_id, positive_only)
    for item_id, delta in net_deltas.items():
        if delta:
            _apply_stock_change(company_id, item_id, delta)


def _restore_stock_on_delete(company_id, products):
    deltas = _stock_deltas(products)
    for item_id, qty in deltas.items():
        _apply_stock_change(company_id, item_id, -qty)


class BillViewSet(ViewSet):
    permission_classes = [IsAuthenticated]

    def _company_id(self, request):
        return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)

    def _get_bill(self, pk, company_id):
        """Look up a bill by id, scoped to the caller's company.

        Raises a clean DRF exception (400 for a malformed id, 404 for a
        missing/wrong-company bill) instead of letting bson/mongoengine
        errors bubble up as uncaught 500s.
        """
        try:
            object_id = ObjectId(pk)
        except (InvalidId, TypeError):
            raise ValidationError({"detail": "Invalid bill id."})
        try:
            return Bill.objects.get(id=object_id, company_id=company_id)
        except Bill.DoesNotExist:
            raise NotFound({"detail": "Bill not found."})

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
        bill = self._get_bill(pk, company_id)
        requested_type = request.data.get("bill_type", bill.bill_type)
        if requested_type != bill.bill_type:
            # bill_type must never change through a plain update -- the only
            # sanctioned transition is kacha -> pakka via convert(), which
            # also enforces GST fields and issues a fresh invoice number.
            # Allowing it here would let a client silently flip a pakka bill
            # back to kacha (undoing GST compliance) or skip convert()'s
            # validation entirely.
            raise ValidationError(
                {"detail": "Bill type cannot be changed via update. Use the convert endpoint to turn a kacha bill into a pakka bill."}
            )
        if bill.bill_type == "pakka":
            # A pakka bill is a GST-compliant tax invoice -- editing it must
            # never silently drop its GST number or zero out its GST rate.
            # Fall back to the bill's existing values when the request
            # doesn't explicitly supply them, and still reject an explicit
            # attempt to blank them out.
            incoming_gst_number = request.data.get("gst_number")
            if incoming_gst_number is None:
                incoming_gst_number = (bill.buyer or {}).get("gst_number")
            incoming_gst_percentage = request.data.get("gst_percentage")
            if incoming_gst_percentage is None:
                incoming_gst_percentage = bill.gst_percentage
            missing = []
            if not incoming_gst_number:
                missing.append("GST number")
            if incoming_gst_percentage in (None, ""):
                missing.append("GST percentage")
            if missing:
                raise ValidationError(
                    {"detail": f"Cannot update pakka bill: missing required field(s): {', '.join(missing)}."}
                )
            request_data = {**request.data, "gst_number": incoming_gst_number, "gst_percentage": incoming_gst_percentage}
        else:
            request_data = request.data
        old_products = bill.products
        payload = _build_bill_payload(request_data, bill.bill_type, existing=bill)
        _reconcile_stock_on_update(company_id, old_products, payload["products"])
        for field, value in payload.items():
            setattr(bill, field, value)
        bill.save()
        return Response(_serialize_bill(bill))

    def destroy(self, request, pk=None):
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        _restore_stock_on_delete(company_id, bill.products)
        bill.delete()
        return Response(status=204)

    def retrieve(self, request, pk=None):
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        return Response(_serialize_bill(bill))

    @action(detail=False, methods=["post"], url_path="kacha")
    def create_kacha(self, request):
        return self._create_bill(request, "kacha")

    @action(detail=False, methods=["post"], url_path="pakka")
    def create_pakka(self, request):
        return self._create_bill(request, "pakka")

    @action(detail=True, methods=["post"], url_path="convert")
    def convert(self, request, pk=None):
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        if bill.bill_type == "pakka":
            raise ValidationError({"detail": "Bill is already a pakka (formal) bill."})
        if bill.bill_type != "kacha":
            raise ValidationError({"detail": "Only kacha bills can be converted to pakka."})

        # Pakka (GST-compliant) bills require GST details that a kacha bill
        # never collected. Require them explicitly here rather than silently
        # defaulting gst_percentage to 0 or leaving gst_number blank -- an
        # incomplete conversion would produce an invalid tax invoice.
        incoming = request.data or {}
        gst_number = incoming.get("gst_number") or incoming.get("buyer", {}).get("gst_number") or (bill.buyer or {}).get("gst_number")
        # At this point bill.bill_type is guaranteed "kacha" (checked above),
        # so a kacha bill never already has a gst_percentage of its own --
        # the value must come from the incoming request.
        gst_percentage_raw = incoming.get("gst_percentage")
        missing = []
        if not gst_number:
            missing.append("GST number")
        if gst_percentage_raw is None or gst_percentage_raw == "":
            missing.append("GST percentage")
        if missing:
            raise ValidationError(
                {"detail": f"Cannot convert to pakka: missing required field(s): {', '.join(missing)}."}
            )

        products_changed = bool(request.data and "products" in request.data)
        old_products = bill.products
        merged_data = {**bill.to_mongo().to_dict(), **incoming}
        merged_data["gst_number"] = gst_number
        merged_data["gst_percentage"] = gst_percentage_raw
        payload = _build_bill_payload(merged_data, "pakka")
        if products_changed:
            _reconcile_stock_on_update(company_id, old_products, payload["products"])
        for field, value in payload.items():
            setattr(bill, field, value)
        bill.bill_type = "pakka"
        # Kacha and pakka bills use separate invoice number series (kacha is
        # typically an informal/non-GST bill; pakka is the formal tax
        # invoice), so converting must issue a fresh pakka-series number
        # rather than keeping the original kacha number.
        bill.invoice_number = None
        self._save_with_retry(bill, company_id)
        return Response(_serialize_bill(bill))

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        try:
            pdf_bytes = render_bill_pdf(bill)
        except BillPdfRenderError as exc:
            raise ValidationError({"detail": str(exc)})
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{bill.invoice_number}.pdf"'
        return response

    @action(detail=True, methods=["post"], url_path="share-whatsapp")
    def share_whatsapp(self, request, pk=None):
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        # Allow overriding the destination number per-send (e.g. sharing to
        # someone other than the buyer on file), falling back to the number
        # stored on the bill's buyer details.
        phone_number = request.data.get("phone") or (bill.buyer or {}).get("phone")
        if not phone_number:
            raise ValidationError(
                {"detail": "No phone number on file for this bill's customer. Add one and try again."}
            )
        try:
            pdf_bytes = render_bill_pdf(bill)
        except BillPdfRenderError as exc:
            raise ValidationError({"detail": str(exc)})

        company = Company.objects(company_id=company_id).first()
        company_name = company.name if company else None

        # TEMPORARY provider switch -- see WHATSAPP_PROVIDER in
        # insightloop/settings.py for what this means and how to remove it
        # once real Meta credentials are available. Once removed, this
        # should unconditionally call share_bill_pdf_meta (renaming it back
        # to share_bill_pdf is fine too).
        if settings.WHATSAPP_PROVIDER == "openwa":
            try:
                result = share_bill_pdf_openwa(phone_number, pdf_bytes, bill.invoice_number, company_name=company_name)
            except OpenWANotConfigured as exc:
                raise ValidationError({"detail": str(exc)})
            except OpenWASendError as exc:
                raise ValidationError({"detail": str(exc)})
        else:
            try:
                result = share_bill_pdf_meta(phone_number, pdf_bytes, bill.invoice_number, company_name=company_name)
            except WhatsAppNotConfigured as exc:
                raise ValidationError({"detail": str(exc)})
            except WhatsAppSendError as exc:
                raise ValidationError({"detail": str(exc)})

        return Response({"detail": "Bill sent via WhatsApp.", "whatsapp_response": result})

    @action(detail=True, methods=["post"], url_path="record-payment")
    def record_payment(self, request, pk=None):
        """Log a partial or full payment received from the customer for
        this bill, mirroring how a worker's material return is logged in
        chunks. Multiple payments can be recorded against one bill until
        it's fully paid off.
        """
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)

        amount = float(request.data.get("amount", 0) or 0)
        if amount <= 0:
            raise ValidationError({"detail": "Payment amount must be a positive number."})

        raw_date = request.data.get("date")
        payment_date = raw_date or datetime.now().isoformat()

        payment = {
            "amount": amount,
            "date": payment_date,
            "notes": request.data.get("notes", ""),
        }
        bill.payments = (bill.payments or []) + [payment]
        bill.save()
        return Response(_serialize_bill(bill), status=201)

    @action(detail=True, methods=["get"], url_path="profit-preview")
    def profit_preview(self, request, pk=None):
        """Compute (without saving) the suggested profit for this bill, for
        the confirmation screen. Safe to call at any time, including before
        the bill is fully paid, so the user can see how the figure is
        shaping up as payments come in.
        """
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        return Response(compute_suggested_profit(bill))

    @action(detail=True, methods=["post"], url_path="confirm-profit")
    def confirm_profit(self, request, pk=None):
        """Lock in the profit figure that counts toward company-wide
        profit for this bill. The user can accept the system's suggestion
        as-is or supply their own overriding amount (e.g. to account for
        damaged goods or a special arrangement the formula can't see).
        Until this is called, the bill contributes 0 to reported profit.
        """
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)

        suggestion = compute_suggested_profit(bill)
        override = request.data.get("confirmed_amount")
        if override is not None and override != "":
            try:
                confirmed_amount = float(override)
            except (TypeError, ValueError):
                raise ValidationError({"detail": "confirmed_amount must be a number."})
        else:
            confirmed_amount = suggestion["suggested_profit"]

        bill.profit_suggested_amount = suggestion["suggested_profit"]
        bill.profit_confirmed_amount = confirmed_amount
        bill.profit_confirmed = True
        bill.profit_confirmed_at = datetime.now()
        bill.save()
        return Response(_serialize_bill(bill))

    @action(detail=True, methods=["post"], url_path="reopen-profit")
    def reopen_profit(self, request, pk=None):
        """Undo a profit confirmation, e.g. if more payments come in later
        or the user made a mistake. Removes this bill's contribution from
        company-wide profit until it's confirmed again.
        """
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        bill.profit_confirmed = False
        bill.profit_confirmed_amount = None
        bill.profit_confirmed_at = None
        bill.save()
        return Response(_serialize_bill(bill))

    @action(detail=True, methods=["get"], url_path="assignments")
    def assignments(self, request, pk=None):
        """List every worker material assignment linked to this bill, so
        the order-detail view can show production progress and which
        assignments have (or haven't) contributed their wage to cost yet.
        """
        from worker.models import MaterialAssignment

        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        assignments = MaterialAssignment.objects(company_id=company_id, bill_id=str(bill.id)).order_by("-assignment_date")
        return Response(
            [
                {
                    "id": str(a.id),
                    "worker_id": str(a.worker.id) if a.worker else None,
                    "worker_name": a.worker.name if a.worker else "Unknown",
                    "material_name": a.material_name,
                    "quantity": a.quantity,
                    "delivered_quantity": a.delivered_quantity,
                    "status": a.status,
                    "wage_amount": a.wage_amount,
                    "wastage_quantity": a.wastage_quantity,
                }
                for a in assignments
            ]
        )

    @action(detail=True, methods=["post"], url_path="transportation-cost")
    def add_transportation_cost(self, request, pk=None):
        """Log a transportation cost against this order. A list, not a
        single field, since a large order can ship in more than one
        physical batch with separate freight costs.
        """
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        amount = float(request.data.get("amount", 0) or 0)
        if amount <= 0:
            raise ValidationError({"detail": "Transportation cost must be a positive number."})
        entry = {
            "amount": amount,
            "date": request.data.get("date") or datetime.now().isoformat(),
            "notes": request.data.get("notes", ""),
        }
        bill.transportation_costs = (bill.transportation_costs or []) + [entry]
        bill.save()
        return Response(_serialize_bill(bill), status=201)

    @action(detail=True, methods=["post"], url_path="misc-cost")
    def add_misc_cost(self, request, pk=None):
        """Log a miscellaneous cost against this order (packaging, loading
        labor, etc.) -- same running-list pattern as transportation cost.
        """
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        amount = float(request.data.get("amount", 0) or 0)
        if amount <= 0:
            raise ValidationError({"detail": "Cost must be a positive number."})
        entry = {
            "amount": amount,
            "date": request.data.get("date") or datetime.now().isoformat(),
            "notes": request.data.get("notes", ""),
        }
        bill.misc_costs = (bill.misc_costs or []) + [entry]
        bill.save()
        return Response(_serialize_bill(bill), status=201)

    @action(detail=True, methods=["post"], url_path="ready-to-deliver")
    def add_ready_to_deliver(self, request, pk=None):
        """Earmark a batch of finished inventory stock for this specific
        order. Validates the item has enough stock, but does NOT deduct it
        yet -- the stock is only actually removed from inventory once the
        whole order is confirmed shipped (see confirm_shipment), since
        earmarking isn't the same as the goods having left the building.
        """
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        if bill.shipment_confirmed:
            raise ValidationError({"detail": "This order has already been marked shipped."})

        item_id = request.data.get("inventory_item_id")
        quantity = float(request.data.get("quantity", 0) or 0)
        if not item_id:
            raise ValidationError({"detail": "An inventory item must be selected."})
        if quantity <= 0:
            raise ValidationError({"detail": "Quantity must be a positive number."})

        try:
            object_id = ObjectId(item_id)
        except (InvalidId, TypeError):
            raise ValidationError({"detail": "Invalid inventory item id."})
        item = InventoryItem.objects(id=object_id, company_id=company_id).first()
        if item is None:
            raise NotFound({"detail": "Inventory item not found."})

        # Stock already earmarked for OTHER unshipped orders must be
        # excluded from what's available here -- otherwise two different
        # orders could each earmark the same physical units when only one
        # order's worth actually exists.
        already_earmarked = 0.0
        for other_bill in Bill.objects(company_id=company_id, shipment_confirmed=False, id__ne=bill.id):
            for existing_entry in other_bill.ready_to_deliver or []:
                if existing_entry.get("inventory_item_id") == item_id:
                    already_earmarked += existing_entry.get("quantity", 0)
        available = item.quantity - already_earmarked
        if available < quantity:
            raise ValidationError(
                {
                    "detail": (
                        f"Only {available} {item.unit} of {item.name} available to earmark "
                        f"({item.quantity} in stock, {already_earmarked} already reserved for other orders)."
                    )
                }
            )

        entry = {
            "inventory_item_id": item_id,
            "item_name": item.name,
            "quantity": quantity,
            "date": request.data.get("date") or datetime.now().isoformat(),
            "notes": request.data.get("notes", ""),
        }
        bill.ready_to_deliver = (bill.ready_to_deliver or []) + [entry]
        bill.save()
        return Response(_serialize_bill(bill), status=201)

    @action(detail=True, methods=["post"], url_path="confirm-shipment")
    def confirm_shipment(self, request, pk=None):
        """Manually confirm the order has been safely shipped. This is the
        point the ready-to-deliver stock is actually removed from
        inventory -- earmarking (add_ready_to_deliver) only reserves it,
        it doesn't deduct it, since the goods haven't left until this
        confirmation happens.
        """
        company_id = self._company_id(request)
        bill = self._get_bill(pk, company_id)
        if bill.shipment_confirmed:
            raise ValidationError({"detail": "This order is already marked shipped."})
        if not bill.ready_to_deliver:
            raise ValidationError(
                {"detail": "No ready-to-deliver batches recorded for this order yet."}
            )

        for entry in bill.ready_to_deliver:
            item_id = entry.get("inventory_item_id")
            quantity = entry.get("quantity", 0)
            if not item_id:
                continue
            try:
                object_id = ObjectId(item_id)
            except (InvalidId, TypeError):
                continue
            # Best-effort deduction: if the item was deleted or already
            # depleted by something else since earmarking, we don't block
            # shipment confirmation over it -- the shipment already
            # physically happened by the time the user clicks this.
            InventoryItem.objects(id=object_id, company_id=company_id).update(dec__quantity=quantity)

        bill.shipment_confirmed = True
        bill.shipment_confirmed_at = datetime.now()
        bill.save()
        return Response(_serialize_bill(bill))

    def _save_with_retry(self, bill, company_id):
        """Save a bill, regenerating the invoice number on a rare collision.

        generate_invoice_number() reads the latest number and computes the
        next one in a separate step from the actual save, so two concurrent
        requests can compute the same candidate. The unique index on
        (company_id, invoice_number) will reject the second save; when that
        happens we simply generate a fresh number and try again rather than
        surfacing a raw database error to the client.
        """
        for attempt in range(MAX_INVOICE_NUMBER_ATTEMPTS):
            if not bill.invoice_number:
                bill.invoice_number = generate_invoice_number(company_id)
            try:
                bill.save()
                return
            except NotUniqueError:
                bill.invoice_number = None
                continue
        raise ValidationError({"detail": "Could not generate a unique invoice number, please retry."})

    def _create_bill(self, request, bill_type):
        company_id = self._company_id(request)
        payload = _build_bill_payload(request.data, bill_type)
        _reconcile_stock_on_create(company_id, payload["products"])
        bill = Bill(company_id=company_id, **payload)
        self._save_with_retry(bill, company_id)
        return Response(_serialize_bill(bill), status=201)


router = DefaultRouter()
router.register("bills", BillViewSet, basename="bills")
