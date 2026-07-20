from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "inventory"

    def ready(self):
        # Auto-heal a known migration hazard: InventoryItem.sku used to have
        # a global unique=True (before SKUs became company-scoped), which
        # created a MongoDB index named "sku_1". That index was never
        # dropped automatically when the model changed to a compound
        # (company_id, sku) unique index, and MongoDB does not remove
        # stale indexes on its own when a model's meta.indexes changes --
        # so any environment that had the old index physically present
        # would hit a NotUniqueError the moment a second InventoryItem with
        # the same sku value (e.g. two different companies, or two items
        # created via generate_sku() racing) was inserted, even though the
        # model itself has been correct for a while. Removing the stale
        # index here, once, at app startup makes this self-correcting
        # regardless of whether a manual index-drop step was ever run.
        import logging

        logger = logging.getLogger(__name__)
        try:
            from .models import InventoryItem

            collection = InventoryItem._get_collection()
            existing_indexes = collection.index_information()
        except Exception as exc:  # pragma: no cover - depends on DB availability at import time
            # Startup must never crash because Mongo isn't reachable yet
            # (e.g. during some management commands, or if the DB comes up
            # after the app). This is a self-heal, not a hard requirement.
            logger.warning("Skipped inventory index self-heal (DB not ready?): %s", exc)
            return

        for index_name, index_info in existing_indexes.items():
            if index_name == "_id_":
                continue
            key_fields = [field for field, _ in index_info.get("key", [])]
            is_unique = index_info.get("unique", False)
            # Match the old global-unique single-field sku index
            # specifically -- never touch the compound (company_id, sku)
            # index or anything else, so this can't accidentally remove an
            # index the app actually relies on.
            if key_fields == ["sku"] and is_unique:
                try:
                    collection.drop_index(index_name)
                    logger.warning(
                        "Dropped stale legacy unique index '%s' on inventory_items.sku "
                        "(superseded by the company-scoped compound index).",
                        index_name,
                    )
                except Exception as exc:  # pragma: no cover - defensive
                    logger.error("Failed to drop stale index '%s' on inventory_items: %s", index_name, exc)
