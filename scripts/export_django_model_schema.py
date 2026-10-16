import os
import sys
import json
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "insightloop"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "insightloop.settings")

import django
django.setup()

import mongoengine.fields as me_fields
from landing.mongo_models import Company, User, ContactMessage
from bills.models import Bill
from dashboard.models import FinancialSummary
from insights.models import Insight
from inventory.models import InventoryItem, Warehouse
from upload.models import BusinessData
from worker.models import MaterialAssignment, PayRecord, Worker

models = [
    User, Company, ContactMessage, Bill, FinancialSummary,
    Insight, InventoryItem, Warehouse, BusinessData,
    MaterialAssignment, PayRecord, Worker
]

def map_field_to_bson(field):
    if isinstance(field, me_fields.StringField):
        return "string"
    elif isinstance(field, me_fields.IntField):
        return "int"
    elif isinstance(field, me_fields.FloatField):
        return "double"
    elif isinstance(field, me_fields.DecimalField):
        return "decimal"
    elif isinstance(field, me_fields.BooleanField):
        return "bool"
    elif isinstance(field, me_fields.DateTimeField):
        return "date"
    elif isinstance(field, me_fields.ObjectIdField):
        return "objectId"
    elif isinstance(field, me_fields.ReferenceField):
        return "objectId"
    elif isinstance(field, me_fields.ListField):
        return "array"
    elif isinstance(field, me_fields.DictField):
        return "object"
    elif isinstance(field, me_fields.EmbeddedDocumentField):
        return "object"
    return "string"

schema = {}

for model in models:
    coll_name = model._get_collection_name()
    fields_schema = {}
    
    for fname, field in model._fields.items():
        choices = getattr(field, "choices", None)
        if choices:
            choices = [c[0] if isinstance(c, (list, tuple)) else c for c in choices]
            
        default_val = getattr(field, "default", None)
        if callable(default_val):
            default_val = "<callable>"
        elif default_val is not None and not isinstance(default_val, (str, int, float, bool, list, dict)):
            default_val = str(default_val)
            
        cascade_rule = getattr(field, "reverse_delete_rule", None)
        if cascade_rule is not None:
            rule_map = {0: "DO_NOTHING", 1: "NULLIFY", 2: "CASCADE", 3: "DENY", 4: "PULL"}
            cascade_rule = rule_map.get(cascade_rule, str(cascade_rule))
            
        fields_schema[fname] = {
            "bson_type": map_field_to_bson(field),
            "required": getattr(field, "required", False),
            "nullable": getattr(field, "null", True),
            "choices": choices,
            "default": default_val,
            "cascade_rule": cascade_rule
        }
        
    indexes = []
    meta_indexes = model._meta.get("indexes", [])
    for idx in meta_indexes:
        if isinstance(idx, str):
            indexes.append({"fields": [idx], "unique": False})
        elif isinstance(idx, dict):
            indexes.append(idx)
        elif isinstance(idx, (list, tuple)):
            indexes.append({"fields": list(idx), "unique": False})

    schema[coll_name] = {
        "model_name": model.__name__,
        "collection": coll_name,
        "fields": fields_schema,
        "indexes": indexes
    }

output_path = ROOT / "docs/migration/django-model-schema.json"
output_path.parent.mkdir(parents=True, exist_ok=True)

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(schema, f, indent=2, sort_keys=True)

content = output_path.read_bytes()
sha = hashlib.sha256(content).hexdigest()

sha_path = ROOT / "docs/migration/django-model-schema.json.sha256"
with open(sha_path, "w", encoding="utf-8") as f:
    f.write(f"{sha}  docs/migration/django-model-schema.json\n")

print(f"Exported {len(schema)} collections to {output_path}")
print(f"SHA256: {sha}")
