"""Profit computation for a bill/consignment.

The suggested profit is: (revenue actually collected so far) minus (cost of
goods, scaled to match how much of the bill has been collected). This is a
*suggestion* only -- it never writes to the bill directly. The user reviews
it via the confirmation flow in bills/views.py and can accept or override
the number before it counts toward company-wide profit (see
Bill.profit_confirmed / profit_confirmed_amount).

Cost of goods = material cost + worker (production) cost + transportation
cost + miscellaneous cost:

- Material: for each product line linked to an inventory item
  (inventory_item_id present), cost = quantity * that item's cost_price.
  Freeform line items (not linked to inventory) have no known cost, so
  their full revenue counts as profit -- disclosed on the confirmation
  screen so the user can adjust if it's wrong for a particular consignment.
- Worker: total wages for every MaterialAssignment linked to this bill
  that has been marked complete (see Bill.worker_cost_total). Only
  completed assignments count, so labor cost isn't recognized before the
  job is actually finished.
- Transportation / misc: the running totals logged against the bill (see
  Bill.transportation_cost_total / misc_cost_total).

All four components are scaled by payment_fraction, consistent with the
material-cost scaling: a partially paid bill only has a matching fraction
of its total cost recognized, since none of these costs should outweigh
revenue that hasn't actually come in yet.
"""
from inventory.models import InventoryItem


def compute_bill_cost_breakdown(bill):
    """Return a breakdown of MATERIAL cost basis for a bill's product
    lines only. Worker/transportation/misc costs are added on top of this
    in compute_suggested_profit, since they aren't per-line-item.

    Returns a dict: {
        "lines": [{"name", "quantity", "inventory_item_id", "unit_cost",
                    "line_cost", "cost_known"}],
        "total_cost": float,  # full (unscaled) material cost basis
    }

    Looking up each linked item individually (rather than one bulk query)
    keeps this simple and correct even when a bill has zero or many linked
    lines; bills rarely have more than a handful of line items, so this
    isn't a meaningful performance concern.
    """
    lines = []
    total_cost = 0.0
    for product in bill.products or []:
        item_id = product.get("inventory_item_id")
        quantity = float(product.get("quantity", 0) or 0)
        unit_cost = None
        cost_known = False
        if item_id:
            object_id = _safe_object_id(item_id)
            if object_id is not None:
                item = InventoryItem.objects(id=object_id, company_id=bill.company_id).first()
                if item is not None:
                    unit_cost = item.cost_price
                    cost_known = True
        line_cost = (unit_cost or 0) * quantity if cost_known else 0.0
        total_cost += line_cost
        lines.append(
            {
                "name": product.get("name"),
                "quantity": quantity,
                "inventory_item_id": item_id,
                "unit_cost": unit_cost,
                "line_cost": round(line_cost, 2),
                "cost_known": cost_known,
            }
        )
    return {"lines": lines, "total_cost": round(total_cost, 2)}


def _safe_object_id(value):
    from bson import ObjectId
    from bson.errors import InvalidId

    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def compute_suggested_profit(bill):
    """Compute the suggested profit figure for a bill's confirmation screen.

    cost_of_goods = material_cost + worker_cost + transportation_cost + misc_cost

    The whole cost_of_goods total is scaled by payment_fraction (see
    Bill.payment_fraction), so a partially paid bill only has a matching
    fraction of its cost counted -- counting full cost against partial
    revenue would understate margins for every bill that isn't 100%
    collected yet.
    """
    material_breakdown = compute_bill_cost_breakdown(bill)
    material_cost = material_breakdown["total_cost"]
    worker_cost = bill.worker_cost_total
    transportation_cost = bill.transportation_cost_total
    misc_cost = bill.misc_cost_total

    full_cost_of_goods = round(material_cost + worker_cost + transportation_cost + misc_cost, 2)

    fraction = bill.payment_fraction
    scaled_cost = round(full_cost_of_goods * fraction, 2)
    revenue_collected = bill.amount_received
    suggested_profit = round(revenue_collected - scaled_cost, 2)
    return {
        "revenue_collected": revenue_collected,
        "cost_breakdown": {
            "material_cost": round(material_cost, 2),
            "worker_cost": round(worker_cost, 2),
            "transportation_cost": round(transportation_cost, 2),
            "misc_cost": round(misc_cost, 2),
        },
        "cost_basis_full": full_cost_of_goods,
        "payment_fraction": round(fraction, 4),
        "cost_basis_scaled": scaled_cost,
        "suggested_profit": suggested_profit,
        "lines": material_breakdown["lines"],
    }
