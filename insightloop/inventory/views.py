from bson import ObjectId
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter
from rest_framework.viewsets import ViewSet

from insightloop.api_utils import serialize_value

from .models import InventoryItem, Warehouse


def _serialize_warehouse(warehouse):
    return {
        "id": str(warehouse.id),
        "name": warehouse.name,
        "location": warehouse.location,
        "created_at": serialize_value(warehouse.created_at),
    }


def _serialize_item(item):
    warehouse = Warehouse.objects(id=ObjectId(item.warehouse_id)).first() if item.warehouse_id else None
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

    def _company_id(self, request):
        return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)

    def list(self, request):
        items = InventoryItem.objects(company_id=self._company_id(request), type=self.item_type).order_by("-updated_at")
        return Response([_serialize_item(item) for item in items])

    def create(self, request):
        item = InventoryItem(
            company_id=self._company_id(request),
            type=self.item_type,
            name=request.data.get("name"),
            unit=request.data.get("unit", "pcs"),
            selling_price=float(request.data.get("selling_price", 0) or 0),
            cost_price=float(request.data.get("cost_price", 0) or 0),
            quantity=float(request.data.get("quantity", 0) or 0),
            reorder_level=float(request.data.get("reorder_level", 0) or 0),
            warehouse_id=request.data.get("warehouse_id"),
            image_url=request.data.get("image_url"),
            sku="",
        )
        item.save()
        return Response(_serialize_item(item), status=201)

    def update(self, request, pk=None):
        item = InventoryItem.objects.get(id=ObjectId(pk), company_id=self._company_id(request), type=self.item_type)
        item.name = request.data.get("name", item.name)
        item.unit = request.data.get("unit", item.unit)
        item.selling_price = float(request.data.get("selling_price", item.selling_price) or 0)
        item.cost_price = float(request.data.get("cost_price", item.cost_price) or 0)
        item.quantity = float(request.data.get("quantity", item.quantity) or 0)
        item.reorder_level = float(request.data.get("reorder_level", item.reorder_level) or 0)
        item.warehouse_id = request.data.get("warehouse_id", item.warehouse_id)
        item.image_url = request.data.get("image_url", item.image_url)
        item.save()
        return Response(_serialize_item(item))

    def destroy(self, request, pk=None):
        item = InventoryItem.objects.get(id=ObjectId(pk), company_id=self._company_id(request), type=self.item_type)
        item.delete()
        return Response(status=204)


class FinishedInventoryViewSet(BaseInventoryViewSet):
    item_type = "finished"


class RawInventoryViewSet(BaseInventoryViewSet):
    item_type = "raw"


class WarehouseViewSet(ViewSet):
    def _company_id(self, request):
        return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)

    def list(self, request):
        warehouses = Warehouse.objects(company_id=self._company_id(request)).order_by("name")
        return Response([_serialize_warehouse(item) for item in warehouses])

    def create(self, request):
        warehouse = Warehouse(
            company_id=self._company_id(request),
            name=request.data.get("name"),
            location=request.data.get("location"),
        )
        warehouse.save()
        return Response(_serialize_warehouse(warehouse), status=201)

    def update(self, request, pk=None):
        warehouse = Warehouse.objects.get(id=ObjectId(pk), company_id=self._company_id(request))
        warehouse.name = request.data.get("name", warehouse.name)
        warehouse.location = request.data.get("location", warehouse.location)
        warehouse.save()
        return Response(_serialize_warehouse(warehouse))

    def destroy(self, request, pk=None):
        warehouse = Warehouse.objects.get(id=ObjectId(pk), company_id=self._company_id(request))
        InventoryItem.objects(company_id=self._company_id(request), warehouse_id=str(warehouse.id)).update(unset__warehouse_id=1)
        warehouse.delete()
        return Response(status=204)


class InventoryMetaViewSet(ViewSet):
    def _company_id(self, request):
        return getattr(request, "company_id", None) or getattr(request.user, "company_id", None)

    @action(detail=False, methods=["get"], url_path="warehouse-summary")
    def warehouse_summary(self, request):
        company_id = self._company_id(request)
        warehouses = Warehouse.objects(company_id=company_id)
        summary = []
        for warehouse in warehouses:
            items = InventoryItem.objects(company_id=company_id, warehouse_id=str(warehouse.id))
            summary.append(
                {
                    "warehouse": _serialize_warehouse(warehouse),
                    "items_count": items.count(),
                    "total_quantity": round(sum(item.quantity for item in items), 2),
                    "stock_value": round(sum(item.quantity * item.cost_price for item in items), 2),
                }
            )
        return Response(summary)


router = DefaultRouter()
router.register("inventory/finished", FinishedInventoryViewSet, basename="inventory-finished")
router.register("inventory/raw", RawInventoryViewSet, basename="inventory-raw")
router.register("inventory/warehouses", WarehouseViewSet, basename="inventory-warehouses")
router.register("inventory", InventoryMetaViewSet, basename="inventory-meta")
