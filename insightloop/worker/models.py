from bson import ObjectId
from mongoengine import Document, fields, ValidationError
from datetime import datetime
from bson.dbref import DBRef
from django.conf import settings

class Worker(Document):
    company_id = fields.StringField(required=True)
    name = fields.StringField(required=True)
    age = fields.IntField()
    image_url = fields.StringField()
    address = fields.StringField()
    phone = fields.StringField()
    joining_date = fields.DateTimeField(default=datetime.now)
    is_active = fields.BooleanField(default=True)
    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)
    
    def __str__(self):
        return str(self.id)
    
    def delete(self, *args, **kwargs):
        MaterialAssignment.objects.filter(worker=self).delete()
        PayRecord.objects.filter(worker=self).delete()
        super().delete(*args, **kwargs)

    meta = {
        'collection': 'workers',
        'indexes': [
            'name',
            {'fields': ['joining_date'], 'name': 'joining_date_idx'}
        ]
    }

class MaterialAssignment(Document):
    company_id = fields.StringField(required=True)
    worker = fields.ReferenceField(Worker)
    material_name = fields.StringField(required=True)
    quantity = fields.IntField(required=True)
    price_per_unit = fields.FloatField(required=True)
    assignment_date = fields.DateTimeField(required=True)
    notes = fields.StringField()
    batches = fields.ListField(fields.DictField())
    # 'open' while chunks are still coming back; 'completed' once the user
    # closes it out and wastage is computed. Locked after completion so the
    # wastage figure can't drift from further batch entries.
    status = fields.StringField(required=True, default="open", choices=("open", "completed"))
    completed_at = fields.DateTimeField()
    wastage_quantity = fields.IntField()

    # Links this production job to the customer order that caused it (a
    # bill can have many assignments -- e.g. three workers each producing
    # part of one order). Optional: material assignments made without a
    # specific order in mind (general stock production) simply leave this
    # unset and never contribute to any bill's cost of goods.
    bill_id = fields.StringField()

    # Flat wage agreed for this whole job, regardless of how many pieces
    # actually come back (wastage is the business's risk, not deducted from
    # the worker's agreed pay). 0/unset means this assignment has no
    # associated labor cost to track (e.g. the worker is salaried
    # separately, or this is just a stock-tracking entry).
    wage_amount = fields.FloatField(default=0)

    # Set once complete() auto-creates a PayRecord for wage_amount, so a
    # re-completion (shouldn't normally happen, since status locks this)
    # can never create a duplicate pay record.
    pay_record_id = fields.StringField()

    # True once this assignment's delivered_quantity has been added into
    # Finished Goods inventory (either by complete() itself, or by the
    # one-time backfill command for assignments completed before this sync
    # existed). Prevents ever double-counting the same production into
    # inventory stock.
    synced_to_inventory = fields.BooleanField(default=False)

    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)

    meta = {
        'collection': 'material_assignments',
        'indexes': [
            'worker',
            {'fields': ['assignment_date'], 'name': 'assignment_date_idx'},
            {'fields': ['material_name'], 'name': 'material_name_idx'},
            {'fields': ['status'], 'name': 'status_idx'},
            {'fields': ['bill_id'], 'name': 'bill_id_idx'},
        ]
    }
    
    @property
    def delivered_quantity(self):
        return sum(batch.get('quantity', 0) for batch in self.batches)
    
    @property
    def balance_quantity(self):
        return self.quantity - self.delivered_quantity
    
    @property
    def total_value(self):
        return self.quantity * self.price_per_unit
    
    @property
    def worker_id(self):
        return self.worker.id if self.worker else None

    def complete(self):
        """Close out the assignment: sync delivered stock into inventory,
        create the worker's pay record, then persist the assignment itself
        as completed -- in that specific order, and each step checks
        whether it already ran, so this is safe to simply call again if a
        previous attempt failed partway through (e.g. a transient DB error).

        MongoDB here isn't wrapped in a multi-document transaction (this
        app doesn't set up a session/transaction for it), so true atomicity
        across three separate documents (InventoryItem, PayRecord,
        MaterialAssignment) isn't available. Instead, this is designed to
        be safely RESUMABLE: each side effect records that it happened
        (synced_to_inventory, pay_record_id) before moving to the next, and
        every step is skipped if that record shows it already ran. So if
        this raises partway through, calling complete() again (e.g. via a
        retried "mark complete" click) will pick up exactly where it left
        off rather than double-counting stock or creating a duplicate pay
        record.

        Wastage is only meaningful once all chunks have been returned, so
        it's computed once here rather than guessed at per-batch -- the
        actual conversion rate (raw material in vs usable output out) is
        only known when the whole job is done, and varies worker to worker.
        A negative wastage (more returned than assigned) is left at 0 and
        flagged separately, since that signals a data-entry problem rather
        than negative waste.

        Returns the newly created PayRecord if one was created on THIS
        call, else None (either no wage was due, or it was already created
        on a previous attempt).
        """
        actual = self.delivered_quantity
        expected = self.quantity
        self.wastage_quantity = max(expected - actual, 0)

        # 1. Inventory sync first -- this is the step most likely to fail
        # (e.g. an unexpected unique-index collision), so it must complete
        # -- and be recorded as complete via synced_to_inventory -- before
        # anything else commits. If this raises, self.status is still
        # "open" (never set below this point), so the assignment is
        # untouched and "mark complete" can simply be retried.
        if not self.synced_to_inventory and actual > 0:
            self._add_to_finished_inventory(actual)
            self.synced_to_inventory = True
            self.save()  # persist the sync flag immediately so a retry never double-adds stock

        # 2. Pay record next, only once inventory sync is confirmed done
        # (or wasn't needed). pay_record_id guards against ever creating a
        # second PayRecord if this method is called again after already
        # succeeding here once.
        new_pay_record = None
        if self.wage_amount and self.wage_amount > 0 and not self.pay_record_id and self.worker:
            new_pay_record = PayRecord(
                company_id=self.company_id,
                worker=self.worker,
                product_name=self.material_name,
                units_produced=1,
                rate_per_unit=self.wage_amount,
                amount_paid=0,
                paid=False,
                date=datetime.now(),
                bill_id=self.bill_id,
                source_assignment_id=str(self.id) if self.id else None,
            )
            new_pay_record.save()
            self.pay_record_id = str(new_pay_record.id)
            self.save()  # persist pay_record_id immediately so a retry never creates a duplicate

        # 3. Only now mark the assignment itself completed -- this is the
        # final commit, done last and only after both side effects above
        # are confirmed persisted.
        self.status = "completed"
        self.completed_at = datetime.now()
        self.save()

        return new_pay_record

    def _add_to_finished_inventory(self, quantity):
        """Find-or-create a Finished Goods InventoryItem matching this
        assignment's material_name (case-insensitive, scoped to this
        company) and add the delivered quantity to its stock. Deferred
        import avoids a circular dependency between the worker and
        inventory apps.
        """
        from inventory.models import InventoryItem

        name = (self.material_name or "").strip()
        if not name:
            return

        existing = InventoryItem.objects(
            company_id=self.company_id, type="finished", name__iexact=name
        ).first()
        if existing is not None:
            existing.update(inc__quantity=quantity)
            return

        # Unit price for a newly created item is left at 0 -- the business
        # sets a real selling/cost price later in Inventory; auto-creating
        # with a guessed price could silently misprice a product.
        InventoryItem(
            company_id=self.company_id,
            type="finished",
            name=name,
            unit="pcs",
            quantity=quantity,
            sku="",
        ).save()

    @property
    def over_returned(self):
        """True if more was returned than was ever assigned -- a data-entry
        anomaly to flag rather than silently absorb into wastage math."""
        return self.delivered_quantity > self.quantity
    
    def clean(self):
        if self.quantity <= 0:
            raise ValidationError("Quantity must be positive")
        if self.price_per_unit <= 0:
            raise ValidationError("Price must be positive")
        if self.wage_amount and self.wage_amount < 0:
            raise ValidationError("Wage amount cannot be negative")

class PayRecord(Document):
    company_id = fields.StringField(required=True)
    worker = fields.ReferenceField(Worker)
    product_name = fields.StringField(required=True)
    units_produced = fields.IntField(required=True)
    rate_per_unit = fields.FloatField(required=True)
    amount_paid = fields.FloatField(default=0)
    date = fields.DateTimeField(required=True)
    paid = fields.BooleanField(default=False)
    # Set when this pay record was auto-generated from a completed
    # MaterialAssignment linked to a bill, so the worker-cost history for
    # an order can be reconstructed (which job produced how much pay).
    # Both optional: a manually-created pay record (not tied to any
    # assignment/order) simply leaves these unset.
    bill_id = fields.StringField()
    source_assignment_id = fields.StringField()
    created_at = fields.DateTimeField(default=datetime.now)
    updated_at = fields.DateTimeField(default=datetime.now)

    meta = {
        'collection': 'pay_records',
        'indexes': [
            'worker', 
            'paid',
            {'fields': ['date'], 'name': 'date_idx'},
            {'fields': ['bill_id'], 'name': 'pay_bill_id_idx'},
        ]
    }
    
    def clean(self):
        if self.units_produced <= 0:
            raise ValidationError("Units produced must be positive")
        if self.rate_per_unit <= 0:
            raise ValidationError("Rate per unit must be positive")