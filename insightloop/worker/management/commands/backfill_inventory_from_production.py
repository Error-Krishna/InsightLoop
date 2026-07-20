"""One-time backfill: add delivered quantity from already-completed worker
assignments into Finished Goods inventory.

This exists because MaterialAssignment.complete() didn't sync to inventory
until this fix -- any assignment marked complete before then has real,
finished production that was never added to Inventory, which is why it
doesn't show up in a bill's Ready to Deliver picker.

Safe to run multiple times: each assignment is only synced once, tracked by
MaterialAssignment.synced_to_inventory.
"""
from django.core.management.base import BaseCommand

from worker.models import MaterialAssignment


class Command(BaseCommand):
    help = "Backfill Finished Goods inventory from already-completed worker assignments."

    def add_arguments(self, parser):
        parser.add_argument(
            "--company-id",
            type=str,
            default=None,
            help="Limit the backfill to a single company. Defaults to all companies.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be synced without making any changes.",
        )

    def handle(self, *args, **options):
        query = MaterialAssignment.objects(status="completed", synced_to_inventory=False)
        company_id = options.get("company_id")
        if company_id:
            query = query.filter(company_id=company_id)

        assignments = list(query)
        if not assignments:
            self.stdout.write(self.style.SUCCESS("Nothing to backfill -- all completed assignments are already synced."))
            return

        self.stdout.write(f"Found {len(assignments)} completed assignment(s) not yet synced to inventory.")

        for assignment in assignments:
            delivered = assignment.delivered_quantity
            if delivered <= 0:
                self.stdout.write(
                    f"  Skipping assignment {assignment.id} ({assignment.material_name}): 0 delivered, nothing to add."
                )
                assignment.synced_to_inventory = True
                if not options["dry_run"]:
                    assignment.save()
                continue

            self.stdout.write(
                f"  Assignment {assignment.id}: {assignment.material_name} x{delivered} "
                f"(company {assignment.company_id})"
            )
            if options["dry_run"]:
                continue

            assignment._add_to_finished_inventory(delivered)
            assignment.synced_to_inventory = True
            assignment.save()

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry run -- no changes were made. Re-run without --dry-run to apply."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Backfilled {len(assignments)} assignment(s) into inventory."))
