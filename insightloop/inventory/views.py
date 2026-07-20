from bson import ObjectId
from bson.errors import InvalidId
from mongoengine import ValidationError as MongoValidationError
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter
from rest_framework.viewsets import ViewSet

from insightloop.api_utils import serialize_value

from .models import InventoryItem, Warehouse


def _to_object_id(pk):
    try:
        return ObjectId(pk)
    except (InvalidId, TypeError):
        raise ValidationError({"detail": "Invalid id."})


def _serialize_warehouse(warehouse):
    return {
        "id": str(warehouse.id),
        "name": warehouse.name,
        "location": warehouse.location,
        "created_at": serialize_value(warehouse.created_at),
    }


def _serialize_item(item):
    warehouse = None
    if item.warehouse_id:
        try:
            warehouse = Warehouse.objects(id=ObjectId(item.warehouse_id)).first()
        except InvalidId:
            warehouse = None
    return {
        "id": str(item.id),
        "name": item.name,
        "unit": item.unit,
        "type": item.type,
        "selling_price": item.selling_price,
        "cost_price": item.cost_price,
        "quantity": item.quantity,
        "reorder_level": item.reorder_level,
        "warehouse_id": item.warehouse_id,
        "warehouse_name": warehouse.name if warehouse else None,
        "image_url": item.image_url,
        "sku": item.sku,
        "status": "Out of Stock" if item.quantity <= 0 else "In Stock",
        "created_at": serialize_value(item.created_at),
        "updated_at": serialize_value(item.updated_at),
    }


class BaseInventoryViewSet(ViewSet):
    item_type = None
    permission_classes = [IsAuthenticated]

    def _company_id(self, request):
        return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)

    def list(self, request):
        items = InventoryItem.objects(company_id=self._company_id(request), type=self.item_type).order_by("-updated_at")
        return Response([_serialize_item(item) for item in items])

    def create(self, request):
        name = (request.data.get("name") or "").strip()
        if not name:
            raise ValidationError({"detail": "Item name is required."})
        item = InventoryItem(
            company_id=self._company_id(request),
            type=self.item_type,
            name=name,
            unit=request.data.get("unit", "pcs"),
            selling_price=float(request.data.get("selling_price", 0) or 0),
            cost_price=float(request.data.get("cost_price", 0) or 0),
            quantity=float(request.data.get("quantity", 0) or 0),
            reorder_level=float(request.data.get("reorder_level", 0) or 0),
            warehouse_id=request.data.get("warehouse_id"),
            image_url=request.data.get("image_url"),
            sku="",
        )
        try:
            item.save()
        except MongoValidationError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(_serialize_item(item), status=201)

    def update(self, request, pk=None):
        try:
            item = InventoryItem.objects.get(
                id=_to_object_id(pk), company_id=self._company_id(request), type=self.item_type
            )
        except InventoryItem.DoesNotExist:
            raise NotFound({"detail": "Inventory item not found."})
        item.name = request.data.get("name", item.name)
        item.unit = request.data.get("unit", item.unit)
        item.selling_price = float(request.data.get("selling_price", item.selling_price) or 0)
        item.cost_price = float(request.data.get("cost_price", item.cost_price) or 0)
        item.quantity = float(request.data.get("quantity", item.quantity) or 0)
        item.reorder_level = float(request.data.get("reorder_level", item.reorder_level) or 0)
        item.warehouse_id = request.data.get("warehouse_id", item.warehouse_id)
        item.image_url = request.data.get("image_url", item.image_url)
        try:
            item.save()
        except MongoValidationError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(_serialize_item(item))

    def destroy(self, request, pk=None):
        try:
            item = InventoryItem.objects.get(
                id=_to_object_id(pk), company_id=self._company_id(request), type=self.item_type
            )
        except InventoryItem.DoesNotExist:
            raise NotFound({"detail": "Inventory item not found."})
        item.delete()
        return Response(status=204)


class FinishedInventoryViewSet(BaseInventoryViewSet):
    item_type = "finished"


class SemiFinishedInventoryViewSet(BaseInventoryViewSet):
    item_type = "semi_finished"

    @action(detail=False, methods=["get"], url_path="live")
    def live(self, request):
        """Work-in-progress inventory, hybrid view: manually-added WIP
        items (same as any other inventory item) PLUS auto-derived rows
        built live from every open (not yet completed) worker material
        assignment -- whether or not it's linked to a specific bill/order.
        This is what actually reflects real production in progress, since
        a manually-tracked WIP quantity would otherwise drift out of sync
        with what workers are really holding.

        WIP items never have a real warehouse -- they're physically with
        whichever worker is holding the material, not in storage -- so the
        auto-derived rows report a descriptive location ("With <worker>")
        instead of a warehouse_id/warehouse_name.
        """
        from bills.models import Bill
        from worker.models import MaterialAssignment

        company_id = self._company_id(request)

        manual_items = InventoryItem.objects(company_id=company_id, type="semi_finished").order_by("-updated_at")
        manual_rows = [{**_serialize_item(item), "source": "manual"} for item in manual_items]

        open_assignments = MaterialAssignment.objects(company_id=company_id, status="open").order_by("-assignment_date")
        derived_rows = []
        for assignment in open_assignments:
            order_info = None
            if assignment.bill_id:
                try:
                    bill = Bill.objects(id=ObjectId(assignment.bill_id), company_id=company_id).first()
                except (InvalidId, TypeError):
                    bill = None
                if bill is not None:
                    order_info = {
                        "bill_id": str(bill.id),
                        "invoice_number": bill.invoice_number,
                        "order_status": bill.order_status,
                        "buyer_name": (bill.buyer or {}).get("name"),
                    }
            derived_rows.append(
                {
                    "id": f"assignment:{assignment.id}",
                    "source": "assignment",
                    "assignment_id": str(assignment.id),
                    "name": assignment.material_name,
                    "unit": "pcs",
                    "type": "semi_finished",
                    "assigned_quantity": assignment.quantity,
                    "delivered_quantity": assignment.delivered_quantity,
                    "balance_quantity": assignment.balance_quantity,
                    "quantity": assignment.balance_quantity,
                    "location_label": f"With {assignment.worker.name}" if assignment.worker else "Worker unassigned",
                    "worker_id": str(assignment.worker.id) if assignment.worker else None,
                    "worker_name": assignment.worker.name if assignment.worker else None,
                    "order": order_info,
                    "assignment_date": serialize_value(assignment.assignment_date),
                }
            )

        return Response({"manual_items": manual_rows, "in_production": derived_rows})


class RawInventoryViewSet(BaseInventoryViewSet):
    item_type = "raw"


class WarehouseViewSet(ViewSet):
    permission_classes = [IsAuthenticated]

    def _company_id(self, request):
        return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)

    def list(self, request):
        warehouses = Warehouse.objects(company_id=self._company_id(request)).order_by("name")
        return Response([_serialize_warehouse(item) for item in warehouses])

    def create(self, request):
        name = (request.data.get("name") or "").strip()
        if not name:
            raise ValidationError({"detail": "Warehouse name is required."})
        warehouse = Warehouse(
            company_id=self._company_id(request),
            name=name,
            location=request.data.get("location"),
        )
        try:
            warehouse.save()
        except MongoValidationError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(_serialize_warehouse(warehouse), status=201)

    def update(self, request, pk=None):
        try:
            warehouse = Warehouse.objects.get(id=_to_object_id(pk), company_id=self._company_id(request))
        except Warehouse.DoesNotExist:
            raise NotFound({"detail": "Warehouse not found."})
        warehouse.name = request.data.get("name", warehouse.name)
        warehouse.location = request.data.get("location", warehouse.location)
        try:
            warehouse.save()
        except MongoValidationError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(_serialize_warehouse(warehouse))

    def destroy(self, request, pk=None):
        try:
            warehouse = Warehouse.objects.get(id=_to_object_id(pk), company_id=self._company_id(request))
        except Warehouse.DoesNotExist:
            raise NotFound({"detail": "Warehouse not found."})
        InventoryItem.objects(company_id=self._company_id(request), warehouse_id=str(warehouse.id)).update(unset__warehouse_id=1)
        warehouse.delete()
        return Response(status=204)


class InventoryMetaViewSet(ViewSet):
    permission_classes = [IsAuthenticated]

    def _company_id(self, request):
        return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)

    @action(detail=False, methods=["get"], url_path="warehouse-summary")
    def warehouse_summary(self, request):
        company_id = self._company_id(request)
        warehouses = Warehouse.objects(company_id=company_id)
        summary = []
        for warehouse in warehouses:
            items = list(InventoryItem.objects(company_id=company_id, warehouse_id=str(warehouse.id)))
            by_type = {}
            for item in items:
                bucket = by_type.setdefault(item.type, {"items_count": 0, "total_quantity": 0.0, "stock_value": 0.0})
                bucket["items_count"] += 1
                bucket["total_quantity"] += item.quantity
                bucket["stock_value"] += item.quantity * item.cost_price
            for bucket in by_type.values():
                bucket["total_quantity"] = round(bucket["total_quantity"], 2)
                bucket["stock_value"] = round(bucket["stock_value"], 2)
            summary.append(
                {
                    "warehouse": _serialize_warehouse(warehouse),
                    "items_count": len(items),
                    "total_quantity": round(sum(item.quantity for item in items), 2),
                    "stock_value": round(sum(item.quantity * item.cost_price for item in items), 2),
                    # Breakdown by inventory type -- explicitly surfaces
                    # that a warehouse can (and typically does) hold both
                    # raw material and finished/ready-to-ship goods at once,
                    # rather than only showing one combined total.
                    "by_type": {
                        "raw": by_type.get("raw", {"items_count": 0, "total_quantity": 0.0, "stock_value": 0.0}),
                        "finished": by_type.get("finished", {"items_count": 0, "total_quantity": 0.0, "stock_value": 0.0}),
                        "semi_finished": by_type.get("semi_finished", {"items_count": 0, "total_quantity": 0.0, "stock_value": 0.0}),
                    },
                }
            )
        return Response(summary)


router = DefaultRouter()
router.register("inventory/finished", FinishedInventoryViewSet, basename="inventory-finished")
router.register("inventory/semi-finished", SemiFinishedInventoryViewSet, basename="inventory-semi-finished")
router.register("inventory/raw", RawInventoryViewSet, basename="inventory-raw")
router.register("inventory/warehouses", WarehouseViewSet, basename="inventory-warehouses")
router.register("inventory/meta", InventoryMetaViewSet, basename="inventory-meta")
