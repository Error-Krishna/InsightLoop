# dashboard/encoders.py
import json
from decimal import Decimal
from datetime import datetime, date
from bson import ObjectId, Decimal128  # Add Decimal128

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (Decimal, Decimal128)):
            return float(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, ObjectId):
            return str(o)
        return super().default(o)