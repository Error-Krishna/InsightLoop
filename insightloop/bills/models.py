from datetime import datetime

from mongoengine import Document, fields


def generate_invoice_number(company_id):
    """Generate a company-scoped invoice number with year prefix."""
    year = datetime.now().year
    prefix = f"INV-{year}-"
    latest = Bill.objects(company_id=company_id, invoice_number__startswith=prefix).order_by("-invoice_number").first()
    if latest and latest.invoice_number:
        try:
            sequence = int(latest.invoice_number.split("-")[-1]) + 1
        except (TypeError, ValueError):
            sequence = 1
    else:
        sequence = 1
    candidate = f"{prefix}{sequence:05d}"
    # Ensure uniqueness by incrementing if already exists
    while Bill.objects(company_id=company_id, invoice_number=candidate).count() > 0:
        sequence += 1
        candidate = f"{prefix}{sequence:05d}"
    return candidate


class Bill(Document):
    company_id = fields.StringField(required=True)
    bill_type = fields.StringField(required=True, choices=("kacha", "pakka"))
    buyer = fields.DictField(default=dict)
    products = fields.ListField(fields.DictField(), default=list)
    subtotal = fields.FloatField(required=True, default=0)
    gst_percentage = fields.FloatField(default=0)
    gst_amount = fields.FloatField(default=0)
    discount = fields.FloatField(default=0)
    grand_total = fields.FloatField(required=True, default=0)
    invoice_number = fields.StringField(required=True)

    # Payment collection: customers frequently pay in installments rather
    # than all at once, mirroring how workers return raw material in
    # chunks. Each entry is {amount, date, notes}. payment_status is derived
    # (not stored) from amount_received vs grand_total so it can never drift
    # out of sync with the underlying payments list.
    payments = fields.ListField(fields.DictField(), default=list)

    # Profit confirmation: once a bill is fully paid, the system proposes a
    # profit figure for that consignment (revenue collected minus the cost
    # basis of any inventory-linked line items, worker production cost,
    # transportation, and misc costs) and asks the user to confirm or
    # override it before it counts toward company-wide profit. Until
    # confirmed, this bill contributes 0 to reported profit -- it is NOT
    # silently assumed correct, since real consignments can have
    # circumstances (damage, special pricing) a formula can't see.
    profit_confirmed = fields.BooleanField(default=False)
    profit_suggested_amount = fields.FloatField()  # last auto-computed suggestion, for reference/audit
    profit_confirmed_amount = fields.FloatField()  # the actual figure counted toward company profit
    profit_confirmed_at = fields.DateTimeField()

    # Production: which worker material assignments were raised to fulfil
    # this order. The list here is a denormalized cache for quick display;
    # the source of truth for "which assignments belong to this bill" is
    # MaterialAssignment.bill_id, since an assignment can be created/linked
    # from the worker side independently of this list ever being touched.
    worker_assignment_ids = fields.ListField(fields.StringField(), default=list)

    # Extra order-level costs, each logged as a running list (mirrors
    # payments/batches elsewhere) since a single order can involve more than
    # one shipment or more than one incidental cost.
    transportation_costs = fields.ListField(fields.DictField(), default=list)  # [{amount, date, notes}]
    misc_costs = fields.ListField(fields.DictField(), default=list)  # [{amount, date, notes}]

    # Ready-to-deliver tracking: batches of finished inventory earmarked for
    # this specific order as they're produced/set aside, and a manual
    # confirmation once the whole order has actually shipped. Kept as a
    # list (not a single boolean) because a large order can ship in more
    # than one physical batch.
    ready_to_deliver = fields.ListField(fields.DictField(), default=list)  # [{inventory_item_id, quantity, date, notes}]
    shipment_confirmed = fields.BooleanField(default=False)
    shipment_confirmed_at = fields.DateTimeField()

    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)

    meta = {
        "collection": "bills",
        "indexes": [
            {"fields": ["company_id", "bill_type"]},
            {"fields": ["company_id", "invoice_number"], "unique": True},
            {"fields": ["company_id", "profit_confirmed"]},
            "-created_at",
        ],
    }

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = generate_invoice_number(self.company_id)
        self.updated_at = datetime.now()
        return super().save(*args, **kwargs)

    @property
    def amount_received(self):
        return round(sum(p.get("amount", 0) for p in (self.payments or [])), 2)

    @property
    def balance_due(self):
        return round(max(self.grand_total - self.amount_received, 0), 2)

    @property
    def over_received(self):
        """True if more was collected than the bill total -- a data-entry
        anomaly (e.g. a duplicate payment log) to surface rather than
        silently absorb."""
        return self.amount_received > self.grand_total

    @property
    def payment_status(self):
        if self.grand_total <= 0:
            return "paid"
        received = self.amount_received
        if received <= 0:
            return "unpaid"
        if received >= self.grand_total:
            return "paid"
        return "partial"

    @property
    def payment_fraction(self):
        """Fraction (0-1) of the bill actually collected, used to scale the
        cost basis proportionally: a partially paid bill should only count
        a matching fraction of its cost against profit, since counting full
        cost against partial revenue would distort margins."""
        if self.grand_total <= 0:
            return 0.0
        return min(self.amount_received / self.grand_total, 1.0)

    @property
    def transportation_cost_total(self):
        return round(sum(c.get("amount", 0) for c in (self.transportation_costs or [])), 2)

    @property
    def misc_cost_total(self):
        return round(sum(c.get("amount", 0) for c in (self.misc_costs or [])), 2)

    @property
    def worker_cost_total(self):
        """Sum of wage_amount for every MaterialAssignment linked to this
        bill that has been marked complete (see
        MaterialAssignment.complete()) -- an assignment only contributes
        its cost once the job is actually finished and its pay record has
        been created, not while it's still open/in progress. Deferred
        import avoids a circular dependency (worker/api_views.py imports
        Bill from this module).
        """
        from worker.models import MaterialAssignment

        assignments = MaterialAssignment.objects(
            company_id=self.company_id, bill_id=str(self.id), status="completed"
        )
        return round(sum(a.wage_amount or 0 for a in assignments), 2)

    @property
    def ready_to_deliver_quantity(self):
        return sum(b.get("quantity", 0) for b in (self.ready_to_deliver or []))

    @property
    def order_status(self):
        """Human-facing lifecycle stage, derived from real underlying facts
        rather than stored as an independent flag -- so it can never drift
        out of sync with what's actually true about the bill. Stages:

        draft            kacha bill, not yet converted
        confirmed        converted to pakka, no production linked yet
        in_production     has at least one linked assignment, not all complete
        ready_to_ship     all linked assignments complete, not yet shipped
        shipped           shipment_confirmed is True, awaiting full payment
        closed            fully paid AND profit confirmed
        """
        if self.profit_confirmed and self.payment_status == "paid":
            return "closed"
        if self.shipment_confirmed:
            return "shipped"
        if self.bill_type == "kacha":
            return "draft"

        from worker.models import MaterialAssignment

        assignments = list(MaterialAssignment.objects(company_id=self.company_id, bill_id=str(self.id)))
        if not assignments:
            return "confirmed"
        if all(a.status == "completed" for a in assignments):
            return "ready_to_ship"
        return "in_production"